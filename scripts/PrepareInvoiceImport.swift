import Foundation
import CryptoKit

private struct PartyInput: Decodable {
    let name, street, postalCode, city, country, companyID, taxID, vatID: String
    let email, phone, website, registration: String
    let vatPayer: Bool
    func company(id: UUID = UUID()) -> Company {
        var c = Company()
        c.id = id; c.name = name; c.street = street; c.postalCode = postalCode
        c.city = city; c.country = country; c.companyID = companyID
        c.taxID = taxID; c.vatID = vatID; c.email = email; c.phone = phone
        c.website = website; c.registration = registration; c.vatPayer = vatPayer
        return c
    }
}

private struct AccountInput: Decodable { let name, iban, swift: String }
private struct ItemInput: Decodable {
    let name, detail, quantity, unit, unitPrice, discount, vatRate: String
    func item() throws -> InvoiceItem {
        var item = InvoiceItem()
        item.name = name; item.detail = detail; item.unit = unit
        item.quantity = try decimal(quantity); item.unitPrice = try decimal(unitPrice)
        item.discount = try decimal(discount); item.vatRate = try decimal(vatRate)
        return item
    }
}
private struct InvoiceInput: Decodable {
    let sourcePage: Int
    let number, issueDate, dueDate, deliveryDate, variableSymbol, paymentMethod: String
    let currency, paid, sourceTotal, sourceRemaining, note, issuedBy: String
    let supplier, customer: PartyInput
    let account: AccountInput
    let items: [ItemInput]
    let logo, signature: Data
}
private struct Batch: Decodable { let sourceSHA256: String; let invoices: [InvoiceInput] }

private func decimal(_ string: String) throws -> Decimal {
    guard let value = Decimal(string: string, locale: Locale(identifier: "en_US_POSIX")), !value.isNaN else {
        throw DataError.invalid("Invalid amount: \(string)")
    }
    return value
}

@main struct PrepareInvoiceImport {
    static func main() throws {
        guard CommandLine.arguments.count == 4 else { throw DataError.invalid("Usage: prepare-import extracted.json current-database.json destination") }
        let input = URL(fileURLWithPath: CommandLine.arguments[1])
        let current = URL(fileURLWithPath: CommandLine.arguments[2])
        let destination = URL(fileURLWithPath: CommandLine.arguments[3])
        let originalBytes = try Data(contentsOf: current)
        let original = try DatabaseFile.decode(originalBytes)
        var db = original
        let batch = try JSONDecoder().decode(Batch.self, from: Data(contentsOf: input))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Europe/Bratislava")!
        formatter.dateFormat = "dd.MM.yyyy HH:mm"
        func date(_ value: String) throws -> Date {
            guard let parsed = formatter.date(from: value + " 12:00") else { throw DataError.invalid("Invalid date: \(value)") }
            return parsed
        }
        var imported: [String] = []
        var skipped: [String] = []
        var addedCustomers: [String] = []
        var sourceTotal: Decimal = 0
        var sourcePaid: Decimal = 0
        var sourceRemaining: Decimal = 0
        // New contacts use the newest source snapshot. Existing contacts are preserved.
        for source in batch.invoices.sorted(by: { $0.number > $1.number }) {
            if !db.customers.contains(where: { $0.companyID == source.customer.companyID }) {
                guard !source.customer.companyID.isEmpty else { throw DataError.invalid("Missing customer identity") }
                db.customers.append(source.customer.company())
                addedCustomers.append(source.customer.name)
            }
        }
        for source in batch.invoices {
            var invoice = Invoice()
            invoice.number = source.number
            invoice.variableSymbol = source.variableSymbol
            invoice.issueDate = try date(source.issueDate)
            invoice.dueDate = try date(source.dueDate)
            invoice.deliveryDate = source.deliveryDate.isEmpty ? nil : try date(source.deliveryDate)
            invoice.supplier = source.supplier.company(id: db.settings.supplier.id)
            guard let contact = db.customers.first(where: { $0.companyID == source.customer.companyID }) else { throw DataError.invalid("Customer resolution failed") }
            invoice.customer = source.customer.company(id: contact.id)
            guard let account = db.settings.accounts.first(where: { $0.iban.filter { !$0.isWhitespace } == source.account.iban }) else { throw DataError.invalid("Unknown account \(source.account.iban)") }
            var historicalAccount = account
            historicalAccount.name = source.account.name
            historicalAccount.swift = source.account.swift
            invoice.account = historicalAccount
            invoice.items = try source.items.map { try $0.item() }
            invoice.currency = source.currency
            invoice.paid = try decimal(source.paid)
            invoice.paymentMethod = source.paymentMethod
            invoice.note = source.note
            invoice.issuedBy = source.issuedBy
            invoice.logo = source.logo; invoice.signature = source.signature
            invoice.createdAt = invoice.issueDate
            invoice.updatedAt = Date()
            guard invoice.total == (try decimal(source.sourceTotal)), invoice.remaining == (try decimal(source.sourceRemaining)) else {
                throw DataError.invalid("Swift calculation differs from PDF for \(source.number)")
            }
            if let error = invoice.validation(existing: []) { throw DataError.invalid("\(source.number): \(error)") }
            sourceTotal += invoice.total; sourcePaid += invoice.paid; sourceRemaining += invoice.remaining
            if let existing = db.invoices.first(where: { $0.number == source.number }) {
                let sameLines = existing.items.count == invoice.items.count && zip(existing.items, invoice.items).allSatisfy { old, new in
                    old.name == new.name && old.detail == new.detail && old.quantity == new.quantity && old.unit == new.unit && old.unitPrice == new.unitPrice && old.discount == new.discount && old.vatRate == new.vatRate
                }
                guard existing.customer == invoice.customer, existing.supplier == invoice.supplier,
                      existing.issueDate == invoice.issueDate, existing.dueDate == invoice.dueDate,
                      existing.deliveryDate == invoice.deliveryDate, existing.variableSymbol == invoice.variableSymbol,
                      existing.total == invoice.total, existing.paid == invoice.paid,
                      existing.account == invoice.account, existing.currency == invoice.currency,
                      existing.note == invoice.note, existing.paymentMethod == invoice.paymentMethod,
                      existing.issuedBy == invoice.issuedBy, sameLines else {
                    throw DataError.invalid("Existing invoice \(source.number) differs. No files were changed.")
                }
                skipped.append(source.number)
            } else {
                db.invoices.append(invoice)
                imported.append(source.number)
            }
        }
        try db.validateStructure()
        guard db.settings == original.settings else { throw DataError.invalid("Settings changed unexpectedly") }
        for existing in original.invoices {
            guard db.invoices.first(where: { $0.id == existing.id }) == existing else { throw DataError.invalid("Existing invoice modified") }
        }
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        let output = destination.appendingPathComponent("INVOY-import.json")
        let encoded = try DatabaseFile.encode(db)
        guard try DatabaseFile.decode(encoded) == db else { throw DataError.invalid("Round-trip failed") }
        try encoded.write(to: output, options: .atomic)
        let sha = SHA256.hash(data: originalBytes).map { String(format: "%02x", $0) }.joined()
        let report: [String: Any] = [
            "sourceSHA256": batch.sourceSHA256, "previousDatabaseSHA256": sha,
            "imported": imported, "skippedIdentical": skipped, "addedCustomers": addedCustomers,
            "invoiceCount": db.invoices.count, "customerCount": db.customers.count,
            "sourceTotalEUR": NSDecimalNumber(decimal: sourceTotal).stringValue,
            "sourcePaidEUR": NSDecimalNumber(decimal: sourcePaid).stringValue,
            "sourceRemainingEUR": NSDecimalNumber(decimal: sourceRemaining).stringValue,
            "missingNumberInSource": "2026009",
            "notes": ["2026003: global 40% discount represented as the same discount on its single line.", "2026007: hidden quantities inferred as 1 from line totals / unit prices.", "2026008: unit absent in source, preserved empty.", "2026013 and 2026024: payment method absent in source, preserved empty.", "Single account selected from the source PDF payment summary."]
        ]
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("import-report.json"), options: .atomic)
        print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
        print("Prepared validated import: \(output.path)")
    }
}
