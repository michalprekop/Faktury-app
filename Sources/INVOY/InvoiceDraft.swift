import SwiftUI
import InvoiceCore

@MainActor
final class WeakInvoiceDraft {
    weak var value: InvoiceDraft?
    init(_ value: InvoiceDraft) { self.value = value }
}

@MainActor
final class InvoiceDraft: ObservableObject {
    enum SaveState { case saving, saved, recovered, failed }
    @Published var invoice: Invoice {
        didSet {
            if !applying { reconcileNumbers(previous: oldValue) }
            changed()
        }
    }
    @Published var invalid: Set<String> = [] { didSet { if oldValue != invalid { changed() } } }
    @Published private(set) var numericInputs: [String: String] = [:]
    @Published private(set) var saveState: SaveState = .saved
    @Published var message: String?
    private(set) var original: Invoice
    private(set) var isNew: Bool
    private weak var store: Store?
    private var autosaveTask: Task<Void, Never>?
    private var applying = false
    private var modifiedAt = Date()

    init(_ invoice: Invoice, isNew: Bool = false, store: Store? = nil) {
        let recovery = store?.invoiceRecovery.first { $0.id == invoice.id }
        self.invoice = recovery?.invoice ?? invoice
        self.original = store?.database.invoices.first { $0.id == invoice.id } ?? invoice
        self.isNew = isNew
        self.numericInputs = recovery?.numericInputs ?? [:]
        self.invalid = Set(numericInputs.filter { !Self.isCompleteNumber($0.value) }.keys)
        self.store = store
        self.modifiedAt = recovery?.modifiedAt ?? Date()
        store?.register(self)
        if isNew || recovery != nil { changed() }
    }

    deinit { autosaveTask?.cancel() }
    var hasChanges: Bool { isNew || invoice != original || !invalid.isEmpty }
    var canExport: Bool { invalid.isEmpty && invoice.validation(existing: store?.invoices ?? []) == nil }
    var saveLabel: String {
        switch saveState {
        case .saving: return "Ukladám…"
        case .saved: return "Uložené"
        case .recovered: return "Rozpracované uložené"
        case .failed: return "Neuložené"
        }
    }

    func setNumber(_ input: String, key: String, value: Binding<Decimal>) {
        applying = true
        numericInputs[key] = input
        if Self.isCompleteNumber(input), let parsed = Format.decimal(input) {
            value.wrappedValue = parsed
            invalid.remove(key)
        } else { invalid.insert(key) }
        applying = false
        changed()
    }

    private static func isCompleteNumber(_ input: String) -> Bool {
        let trimmed = input.trimmingCharacters(in: .whitespaces)
        return !trimmed.hasSuffix(",") && !trimmed.hasSuffix(".") && Format.decimal(input) != nil
    }

    private func reconcileNumbers(previous: Invoice) {
        func value(_ key: String, in invoice: Invoice) -> Decimal? {
            if key == "paid" { return invoice.paid }
            guard let item = invoice.items.first(where: { key.hasSuffix($0.id.uuidString) }) else { return nil }
            switch key.first {
            case "q": return item.quantity
            case "p": return item.unitPrice
            case "d": return item.discount
            case "v": return item.vatRate
            default: return nil
            }
        }
        applying = true
        for key in Array(numericInputs.keys) where value(key, in: previous) != value(key, in: invoice) {
            numericInputs.removeValue(forKey: key)
            invalid.remove(key)
        }
        applying = false
    }

    private func changed() {
        guard !applying, let store else { return }
        autosaveTask?.cancel()
        modifiedAt = Date()
        // Persist raw input immediately; validated invoice writes are debounced separately.
        guard store.checkpoint(InvoiceRecovery(invoice: invoice, numericInputs: numericInputs, modifiedAt: modifiedAt)) else {
            saveState = .failed
            message = "Zmeny sa nepodarilo uložiť na disk. Skúste uloženie znova pred zatvorením aplikácie."
            return
        }
        saveState = .saving
        message = nil
        autosaveTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(450)) } catch { return }
            guard !Task.isCancelled else { return }
            _ = self?.flush()
        }
    }

    @discardableResult func flush() -> Bool {
        autosaveTask?.cancel(); autosaveTask = nil
        guard let store else { return !hasChanges }
        guard hasChanges || saveState == .saving || saveState == .failed else { return true }
        guard store.checkpoint(InvoiceRecovery(invoice: invoice, numericInputs: numericInputs, modifiedAt: modifiedAt)) else {
            saveState = .failed
            message = "Zmeny sa nepodarilo uložiť na disk. Skúste uloženie znova pred zatvorením aplikácie."
            return false
        }
        if !invalid.isEmpty || invoice.validation(existing: store.invoices) != nil {
            saveState = .recovered
            message = invalid.isEmpty ? invoice.validation(existing: store.invoices) : "Dokončite číselné hodnoty označené červenou. Rozpracovaný vstup je uložený."
            return true
        }
        return save(to: store)
    }

    @discardableResult func save(to store: Store) -> Bool {
        guard invalid.isEmpty else { message = "Opravte číselné hodnoty označené červenou."; return false }
        var candidate = invoice
        candidate.number = candidate.number.trimmingCharacters(in: .whitespacesAndNewlines)
        if let error = candidate.validation(existing: store.invoices) { message = error; return false }
        guard store.save(candidate) else {
            saveState = .failed
            message = "Faktúru sa nepodarilo uložiť. Rozpracovaná verzia zostala zachovaná."
            return false
        }
        applying = true
        invoice = store.database.invoices.first { $0.id == candidate.id } ?? candidate
        original = invoice
        isNew = false
        applying = false
        _ = store.clearRecovery(invoice.id)
        saveState = .saved
        message = nil
        return true
    }

    func stopAutosave() {
        autosaveTask?.cancel(); autosaveTask = nil
        store?.unregister(self)
        store = nil
    }

    func removeItem(_ id: UUID) {
        guard invoice.items.count > 1 else { return }
        applying = true
        invoice.items.removeAll { $0.id == id }
        invalid = invalid.filter { !$0.hasSuffix(id.uuidString) }
        numericInputs = numericInputs.filter { !$0.key.hasSuffix(id.uuidString) }
        applying = false
        changed()
    }
}
