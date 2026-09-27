import XCTest
@testable import InvoiceCore

final class InvoiceCoreTests: XCTestCase {
    private func account(_ iban: String = "SK5211000000002941251513") -> BankAccount {
        var a = BankAccount(); a.name = "Tatra banka"; a.iban = iban; return a
    }
    private func invoice() -> Invoice {
        var i = Invoice(); i.number = "2026001"; i.variableSymbol = "2026001"
        i.supplier.name = "Dodávateľ"; i.customer.name = "Odberateľ"
        i.items[0].name = "Služba"; i.items[0].unitPrice = 100; i.account = account()
        return i
    }
    func testDecimalRoundingAndVAT() {
        var i = invoice(); i.supplier.vatPayer = true
        i.items[0].quantity = Decimal(string: "2.5")!
        i.items[0].unitPrice = Decimal(string: "99.99")!
        i.items[0].discount = 10
        i.items[0].vatRate = 23
        XCTAssertEqual(i.net, Decimal(string: "224.98"))
        XCTAssertEqual(i.vat, Decimal(string: "51.75"))
        XCTAssertEqual(i.total, Decimal(string: "276.73"))
        i.paid = 200
        XCTAssertEqual(i.remaining, Decimal(string: "76.73"))
        i.paid = 300
        XCTAssertEqual(i.remaining, 0)
        XCTAssertEqual(i.overpayment, Decimal(string: "23.27"))
    }
    func testNonVATInvoiceIgnoresItemRate() {
        var i = invoice(); i.items[0].vatRate = 23
        XCTAssertEqual(i.vat, 0); XCTAssertEqual(i.total, 100)
    }
    func testIBANChecksumAndCountryFormat() {
        XCTAssertTrue(account().isValid)
        XCTAssertTrue(account("BE34 9670 2736 6490").isValid)
        XCTAssertFalse(account("SK5211000000002941251514").isValid)
        XCTAssertFalse(account("INVALID").isValid)
    }
    func testNumberingAcrossYearsAndPrefixes() {
        var db = Database(); var old = invoice(); old.number = "2025099"; db.invoices = [old]
        let date = Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 26))!
        XCTAssertEqual(db.nextNumber(date: date), "2026001")
        old.id = UUID(); old.number = "2026025"; db.invoices.append(old)
        XCTAssertEqual(db.nextNumber(date: date), "2026026")
        db.settings.numberPrefix = "FA-"
        XCTAssertEqual(db.nextNumber(date: date), "FA-2026001")
    }
    func testNewInvoiceChoosesOnlyDefaultAccountAndSnapshotsData() {
        var db = Database(); let first = account(); let second = account("BE34967027366490")
        db.settings.accounts = [first, second]; db.settings.defaultAccountID = second.id
        db.settings.supplier.name = "Pôvodná firma"
        let new = db.newInvoice()
        XCTAssertEqual(new.account?.id, second.id)
        db.settings.supplier.name = "Nová firma"; db.settings.accounts.removeAll()
        XCTAssertEqual(new.supplier.name, "Pôvodná firma")
        XCTAssertEqual(new.account?.iban, "BE34967027366490")
    }
    func testValidationRejectsDuplicateNumbersAndBadAmounts() {
        var first = invoice(); var second = first; second.id = UUID()
        XCTAssertNotNil(first.validation(existing: [second]))
        XCTAssertNil(first.validation(existing: [first]))
        first.items[0].quantity = 0
        XCTAssertNotNil(first.validation(existing: []))
        first.items[0].quantity = 1; first.items[0].discount = 101
        XCTAssertNotNil(first.validation(existing: []))
        first.items[0].discount = 0; first.paid = -1
        XCTAssertNotNil(first.validation(existing: []))
    }
    func testStatusAndDueDateBoundaries() {
        var i = invoice()
        i.dueDate = Calendar.current.startOfDay(for: Date())
        XCTAssertEqual(i.status, "Na úhradu")
        i.paid = 10; XCTAssertEqual(i.status, "Čiastočne uhradená")
        i.dueDate = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        XCTAssertEqual(i.status, "Po splatnosti")
        i.paid = 100; XCTAssertEqual(i.status, "Uhradená")
    }
    func testSlovakInputDoesNotSilentlyTruncate() {
        XCTAssertEqual(Format.decimal("1 234,56"), Decimal(string: "1234.56"))
        XCTAssertEqual(Format.decimal("12.1234"), Decimal(string: "12.1234"))
        XCTAssertNil(Format.decimal("12x")); XCTAssertNil(Format.decimal("1.2.3"))
        XCTAssertNil(Format.decimal("")); XCTAssertNil(Format.decimal("1.23456"))
    }
    func testFullyPaidOverdueInvoiceStaysPaidAfterReload() throws {
        var i = invoice()
        i.issueDate = Calendar.current.date(byAdding: .day, value: -30, to: Date())!
        i.dueDate = Calendar.current.date(byAdding: .day, value: -10, to: Date())!
        XCTAssertEqual(i.status, "Po splatnosti")
        i.paid = 99
        XCTAssertEqual(i.status, "Po splatnosti")
        i.paid = i.total
        var db = Database()
        db.invoices = [i]
        let restored = try DatabaseFile.decode(DatabaseFile.encode(db)).invoices[0]
        XCTAssertEqual(restored.status, "Uhradená")
        XCTAssertEqual(restored.remaining, 0)
        XCTAssertNil(try PaymentQR.make(for: restored))
        i.paid = i.total + 10
        XCTAssertEqual(i.status, "Uhradená")
    }
    func testLegacyDraftFlagsDoNotHidePaymentStatusOrLoseRecoveredInput() throws {
        var original = invoice()
        original.dueDate = Calendar.current.date(byAdding: .day, value: 14, to: original.issueDate)!
        var recovered = original
        recovered.paid = 40
        let recovery = InvoiceRecovery(invoice: recovered, numericInputs: ["paid": "40,"])
        var database = Database()
        database.invoices = [original]
        database.invoiceRecovery = [recovery]

        for legacyFlag in [true, false] {
            var json = try XCTUnwrap(JSONSerialization.jsonObject(with: DatabaseFile.encode(database)) as? [String: Any])
            var invoices = try XCTUnwrap(json["invoices"] as? [[String: Any]])
            invoices[0]["isDraft"] = legacyFlag
            json["invoices"] = invoices
            var records = try XCTUnwrap(json["invoiceRecovery"] as? [[String: Any]])
            var recoveredInvoice = try XCTUnwrap(records[0]["invoice"] as? [String: Any])
            recoveredInvoice["isDraft"] = legacyFlag
            records[0]["invoice"] = recoveredInvoice
            json["invoiceRecovery"] = records

            let restored = try DatabaseFile.decode(JSONSerialization.data(withJSONObject: json))
            XCTAssertEqual(restored, database)
            XCTAssertEqual(restored.invoices[0].status, "Na úhradu")
            XCTAssertEqual(restored.invoiceRecovery?.first?.invoice.status, "Čiastočne uhradená")
            let journal = try JSONDecoder().decode([InvoiceRecovery].self, from: JSONSerialization.data(withJSONObject: records))
            XCTAssertEqual(journal, [recovery])
            let encoded = try DatabaseFile.encode(restored)
            XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains("\"isDraft\""))
            XCTAssertEqual(try DatabaseFile.decode(encoded), database)
        }
    }
    func testDatabaseRoundTripBackupAndCorruption() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("database.json")
        var db = Database(); db.invoices = [invoice()]
        try DatabaseFile.save(db, to: url)
        let original = try Data(contentsOf: url)
        db.invoices[0].paid = 80
        try DatabaseFile.save(db, to: url)
        XCTAssertEqual(try DatabaseFile.decode(Data(contentsOf: url)), db)
        XCTAssertEqual(try Data(contentsOf: folder.appendingPathComponent("database.previous.json")), original)
        XCTAssertThrowsError(try DatabaseFile.decode(Data("broken".utf8)))
        db.schemaVersion = 999
        XCTAssertThrowsError(try DatabaseFile.decode(DatabaseFile.encode(db)))
    }
    func testRemovingCustomerPreservesInvoiceSnapshot() {
        var db = Database(); let i = invoice(); db.invoices = [i]; db.customers = [i.customer]
        db.customers.removeAll()
        XCTAssertEqual(db.invoices[0].customer.name, "Odberateľ")
    }
    func testInvoiceSearchFindsEveryItemNameAndDetail() {
        var i = invoice()
        var item = InvoiceItem(); item.name = "Webstránka Mannover.sk"
        item.detail = "Spravovanie webstránky a technická podpora"
        i.items.append(item)
        XCTAssertTrue(i.matchesSearch("Mannover"))
        XCTAssertTrue(i.matchesSearch("MANNOVER.SK"))
        XCTAssertTrue(i.matchesSearch("technicka podpora"))
        XCTAssertTrue(i.matchesSearch("mannover webstranka"))
        XCTAssertFalse(i.matchesSearch("mannover hosting"))
        i.items.removeLast()
        XCTAssertFalse(i.matchesSearch("mannover"))
    }
    func testInvoiceSearchKeepsIdentifiersAndIncludesNotes() {
        var i = invoice()
        i.customer.name = "Manolo & Bay, s. r. o."
        i.customer.companyID = "12345678"; i.customer.taxID = "2123456789"; i.customer.vatID = "SK2123456789"
        i.variableSymbol = "99001234"; i.orderNumber = "OBJ-2026-87"
        i.note = "Projekt Nový začiatok"
        for query in ["2026001", "Manolo", "12345678", "2123456789", "SK2123456789", "99001234", "OBJ-2026-87", "novy zaciatok"] {
            XCTAssertTrue(i.matchesSearch(query), query)
        }
        XCTAssertTrue(i.matchesSearch("  Manolo \t 2026001\n zaciatok  "))
        XCTAssertTrue(i.matchesSearch(""))
        XCTAssertTrue(i.matchesSearch(" \n\t "))
        XCTAssertFalse(i.matchesSearch("ine-faktury"))
    }
}
