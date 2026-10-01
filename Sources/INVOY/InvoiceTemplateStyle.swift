import SwiftUI
import AppKit
import InvoiceCore

/// The Mono 01 header uses the supplied vector wordmark without changing stored invoice logos.
enum MonoInvoiceBrand {
    static let wordmarkData: Data? = {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("sk.faktury.desktop/legacy-wordmark.svg")
        return try? Data(contentsOf: url)
    }()
    static let wordmark = wordmarkData.flatMap { NSImage(data: $0) }
    static func data(for invoice: InvoiceCore.Invoice) -> Data? { invoice.cloudStyle.map { $0.logoData } ?? wordmarkData }
    static func image(for invoice: InvoiceCore.Invoice) -> NSImage? { data(for: invoice).flatMap { NSImage(data: $0) } }
}

private struct InvoiceMonospacedKey: EnvironmentKey {
    static let defaultValue = false
}

private struct InvoiceNumericMonospacedKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var invoiceMonospaced: Bool {
        get { self[InvoiceMonospacedKey.self] }
        set { self[InvoiceMonospacedKey.self] = newValue }
    }

    var invoiceNumericMonospaced: Bool {
        get { self[InvoiceNumericMonospacedKey.self] }
        set { self[InvoiceNumericMonospacedKey.self] = newValue }
    }
}

struct PaperText: View {
    @Environment(\.invoiceMonospaced) private var mono
    @Environment(\.invoiceNumericMonospaced) private var numericMono
    let value: String
    var size: CGFloat = 13
    var weight: NSFont.Weight = .regular
    var monospaced = false

    init(_ value: String, size: CGFloat = 13, weight: NSFont.Weight = .regular, monospaced: Bool = false) {
        self.value = value; self.size = size; self.weight = weight; self.monospaced = monospaced
    }

    var body: some View {
        Text(value).font(Font(InvoiceTypography.font(size: size, weight: weight, monospaced: mono || (monospaced && numericMono))))
    }
}
