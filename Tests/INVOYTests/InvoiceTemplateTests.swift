import XCTest
import AppKit
import PDFKit
import SwiftUI
import InvoiceCore
@testable import INVOY

final class InvoiceTemplateTests: XCTestCase {
    @MainActor func testManoloPaperUsesA4ProportionsAtDifferentWidths() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        var invoice = store.database.invoices[0]
        invoice.templateOverride = .manoloBay
        invoice.paid = 0
        let draft = InvoiceDraft(invoice, store: store)
        let canonical = NSHostingView(rootView: InvoicePaper(draft: draft).environmentObject(store).frame(width: 800))
        XCTAssertEqual(canonical.fittingSize.height, 800 * 297 / 210, accuracy: 1)
        for width: CGFloat in [720, 800, 1000] {
            let host = NSHostingView(rootView: InvoicePaperSurface(draft: draft, width: width)
                .environmentObject(store).frame(width: width))
            let size = host.fittingSize
            XCTAssertEqual(size.width, width, accuracy: 0.1)
            XCTAssertEqual(size.height, width * 297 / 210, accuracy: 1, "Width \(width)")
        }
    }
    @MainActor func testManoloBayEditorRendersRequestedHighlight() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        var invoice = store.database.invoices[0]
        invoice.templateOverride = .manoloBay
        invoice.paid = 0
        let draft = InvoiceDraft(invoice, store: store)
        let host = NSHostingView(rootView: InvoicePaper(draft: draft)
            .environmentObject(store).environment(\.colorScheme, .light)
            .environment(\.locale, Locale(identifier: "sk_SK")).frame(width: 800).background(.white))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 800, height: 1300),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil }
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(180))
        host.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        var matching = 0
        for y in stride(from: 0, to: bitmap.pixelsHigh, by: 4) {
            for x in stride(from: 0, to: bitmap.pixelsWide, by: 4) {
                guard let color = bitmap.colorAt(x: x, y: y) else { continue }
                if abs(color.redComponent - 242 / 255.0) < 0.01,
                   abs(color.greenComponent - 238 / 255.0) < 0.01,
                   abs(color.blueComponent - 234 / 255.0) < 0.01 { matching += 1 }
            }
        }
        XCTAssertGreaterThan(matching, 1500, "The amount band must visibly use #F2EEEA")
        if let output = ProcessInfo.processInfo.environment["INVOY_QA_OUTPUT"] {
            try bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: output))
        }
    }

    @MainActor func testManoloBayExportsContactsAssetsAndReadableQRWithoutChangingInvoice() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.templateOverride = .manoloBay
        invoice.paid = 0
        invoice.items[0].detail = "Popis so slovenskou diakritikou ľščťžýáíéôäň."
        let original = invoice
        XCTAssertNotNil(ManoloInvoiceBrand.image("logo.svg"))
        XCTAssertNotNil(ManoloInvoiceBrand.image("background.png"))
        for format in [PaymentQRFormat.payBySquare, .qrPlatba] {
            invoice.paymentQRFormat = format
            let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
            XCTAssertEqual(document.pageCount, 1)
            let bounds = try XCTUnwrap(document.page(at: 0)).bounds(for: .mediaBox)
            XCTAssertEqual(bounds.height / bounds.width, 297 / 210.0, accuracy: 0.00002)
            let content = normalized(document.string ?? "")
            XCTAssertFalse(content.contains("Web:"))
            for value in ManoloInvoiceBrand.contacts + [invoice.number, invoice.supplier.name, invoice.customer.name,
                invoice.items[0].detail, Format.iban(invoice.account!.iban), "Suma na úhradu"] {
                XCTAssertTrue(content.contains(normalized(value)), "Missing: \(value)")
            }
            XCTAssertEqual(try Verification.scanQR(document), [try XCTUnwrap(PaymentQR.make(for: invoice)).payload])
        }
        invoice.paymentQRFormat = original.paymentQRFormat
        XCTAssertEqual(invoice, original)
        XCTAssertEqual(try JSONDecoder().decode(Invoice.self, from: JSONEncoder().encode(invoice)), invoice)
        let style = try JSONDecoder().decode(CloudInvoiceStyle.self, from: Data("""
            {"id":"manolo-bay","name":"Manolo & Bay","config":{"layout":"manoloBay","accent":"#F2EEEA","wordmark":"Manolo & Bay","logo":"","footer":""}}
            """.utf8))
        invoice.templateOverride = .mono01
        invoice.cloudStyle = style
        XCTAssertEqual(invoice.resolvedTemplate(default: .boringDefault01), .manoloBay)
    }

    @MainActor func testLegacyDatabaseAndBackupKeepOriginalTemplate() async throws {
        let original = Store.seed()
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: DatabaseFile.encode(original)) as? [String: Any])
        var settings = try XCTUnwrap(json["settings"] as? [String: Any])
        settings.removeValue(forKey: "invoiceTemplate"); json["settings"] = settings
        var invoices = try XCTUnwrap(json["invoices"] as? [[String: Any]])
        for index in invoices.indices { invoices[index].removeValue(forKey: "templateOverride") }
        json["invoices"] = invoices
        let decoded = try DatabaseFile.decode(JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(decoded, original)
        XCTAssertEqual(decoded.settings.defaultInvoiceTemplate, .boringDefault01)
        XCTAssertEqual(decoded.invoices[0].resolvedTemplate(default: decoded.settings.defaultInvoiceTemplate), .boringDefault01)
    }

    @MainActor func testGlobalSelectionAndInvoiceOverrideAutosaveIndependently() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let original = store.database.invoices
        var settings = store.database.settings
        settings.invoiceTemplate = .mono01
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.flushSettings())
        XCTAssertEqual(store.database.invoices, original)
        XCTAssertEqual(store.newInvoice().resolvedTemplate(default: store.database.settings.defaultInvoiceTemplate), .mono01)
        let draft = InvoiceDraft(original[0], store: store)
        draft.invoice.templateOverride = .boringDefault01
        XCTAssertTrue(draft.flush())
        let restored = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let saved = restored.database.invoices[0]
        XCTAssertEqual(restored.database.settings.defaultInvoiceTemplate, .mono01)
        XCTAssertEqual(saved.resolvedTemplate(default: .mono01), .boringDefault01)
        XCTAssertEqual(store.duplicate(saved).templateOverride, .boringDefault01)
        var expected = original[0]
        expected.templateOverride = .boringDefault01; expected.updatedAt = saved.updatedAt
        XCTAssertEqual(saved, expected)
        XCTAssertEqual(try DatabaseFile.decode(DatabaseFile.encode(restored.database)), restored.database)
        draft.invoice.templateOverride = nil
        XCTAssertTrue(draft.flush())
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database.invoices[0].resolvedTemplate(default: .mono01), .mono01)
    }

    @MainActor func testIncompleteDraftRetainsTemplateAfterRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let draft = InvoiceDraft(store.database.invoices[0], store: store)
        draft.invoice.templateOverride = .mono01
        draft.invoice.customer.name = ""
        XCTAssertTrue(draft.flush())
        let restored = Store(dataDirectory: directory, initialDatabase: Store.seed())
        XCTAssertEqual(restored.invoiceRecovery.first?.invoice.templateOverride, .mono01)
        XCTAssertEqual(restored.invoiceRecovery.first?.invoice.customer.name, "")
        XCTAssertNil(restored.database.invoices[0].templateOverride)
    }

    @MainActor func testMonoPreservesTextPaymentDetailsAndBothReadableQRFormats() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.templateOverride = .mono01
        invoice.paid = 50
        invoice.deliveryDate = invoice.issueDate
        invoice.orderNumber = "ORDER-2026-42"
        invoice.constantSymbol = "0308"
        invoice.specificSymbol = "99887766"
        invoice.items[0].detail = "Podrobný popis so slovenskou diakritikou ľščťžýáíéôäň."
        invoice.items[0].discount = 10
        for format in [PaymentQRFormat.payBySquare, .qrPlatba] {
            invoice.paymentQRFormat = format
            let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
            let content = normalized(document.string ?? "")
            for value in [invoice.number, invoice.supplier.name, invoice.customer.name, invoice.supplier.registration,
                          invoice.supplier.companyID, invoice.customer.vatID, invoice.supplier.address,
                          invoice.account!.swift, Format.iban(invoice.account!.iban), invoice.variableSymbol,
                          invoice.constantSymbol, invoice.specificSymbol, invoice.orderNumber,
                          invoice.items[0].name, invoice.items[0].detail, "Zľava 10 %", invoice.note,
                          "Dátum dodania", "Celková suma", "Uhradené", "Suma na úhradu", "Podpis a pečiatka",
                          invoice.issuedBy, invoice.supplier.email, invoice.supplier.website,
                          Format.money(invoice.remaining)] {
                XCTAssertTrue(content.contains(normalized(value)), "Missing: \(value)")
            }
            XCTAssertEqual(try Verification.scanQR(document), [try XCTUnwrap(PaymentQR.make(for: invoice)).payload])
            try assertOnlyMonoFonts(document)
        }
    }

    @MainActor func testShortInvoiceFitsOnePageAndOverrideWinsOverGlobalSetting() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.paid = 0
        let inherited = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice, defaultTemplate: .mono01)))
        XCTAssertEqual(inherited.pageCount, 1)
        try assertOnlyMonoFonts(inherited)
        invoice.templateOverride = .boringDefault01
        let original = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice, defaultTemplate: .mono01)))
        XCTAssertEqual(original.pageCount, 1)
        XCTAssertTrue(original.string?.contains("Na úhradu") == true)
        XCTAssertEqual(try Verification.scanQR(original), [try XCTUnwrap(PaymentQR.make(for: invoice)).payload])
    }

    @MainActor func testMonoPaginatesItemsNotesVATAndOverpaymentWithoutDroppingText() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.templateOverride = .mono01
        invoice.supplier.vatPayer = true
        invoice.items = (1...40).map { index in
            var item = InvoiceItem()
            item.name = "Položka \(index)"
            item.detail = String(repeating: "Podrobný text s diakritikou. ", count: index == 20 ? 100 : 2) + "KONIEC-\(index)"
            item.unitPrice = 100; item.vatRate = index % 2 == 0 ? 23 : 5
            return item
        }
        invoice.paid = invoice.total + 12
        invoice.note = String(repeating: "Poznámka ku faktúre a dodaniu. ", count: 200) + "KONIEC-POZNÁMKY"
        let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
        XCTAssertGreaterThan(document.pageCount, 3)
        let content = normalized(document.string ?? "")
        for index in 1...40 { XCTAssertTrue(content.contains("KONIEC-\(index)")) }
        for value in ["DPH 23 %", "DPH 5 %", "Preplatok", "12,00", "KONIEC-POZNÁMKY", "Podpis a pečiatka"] {
            XCTAssertTrue(content.contains(value), value)
        }
        XCTAssertEqual(try Verification.scanQR(document), [])
        for index in 0..<document.pageCount {
            let page = try XCTUnwrap(document.page(at: index))
            XCTAssertTrue(page.string?.contains("\(index + 1)/\(document.pageCount)") == true)
            XCTAssertLessThanOrEqual(page.selection(for: page.bounds(for: .mediaBox))!.bounds(for: page).maxY, 842)
        }
        try assertOnlyMonoFonts(document)
    }

    @MainActor func testQRAndSignatureNeverBecomeAnOrphanPageAfterShortNote() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.templateOverride = .mono01
        invoice.paid = 0
        invoice.items = (1...8).map { index in
            var item = InvoiceItem(); item.name = "Položka \(index): Grafické práce a návrh propagačných materiálov"
            item.unitPrice = 20; return item
        }
        let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
        let lastPage = try XCTUnwrap(document.page(at: document.pageCount - 1)?.string)
        XCTAssertTrue(lastPage.contains("Suma na úhradu"))
        XCTAssertTrue(lastPage.contains("Podpis a pečiatka"))
        XCTAssertEqual(try Verification.scanQR(document), [try XCTUnwrap(PaymentQR.make(for: invoice)).payload])
    }

    private func normalized(_ value: String) -> String { value.split(whereSeparator: \.isWhitespace).joined(separator: " ") }

    private func assertOnlyMonoFonts(_ document: PDFDocument, file: StaticString = #filePath, line: UInt = #line) throws {
        for index in 0..<document.pageCount {
            let page = try XCTUnwrap(document.page(at: index)?.pageRef, file: file, line: line)
            var resources: CGPDFDictionaryRef?, fonts: CGPDFDictionaryRef?
            XCTAssertTrue(CGPDFDictionaryGetDictionary(try XCTUnwrap(page.dictionary), "Resources", &resources), file: file, line: line)
            XCTAssertTrue(CGPDFDictionaryGetDictionary(try XCTUnwrap(resources), "Font", &fonts), file: file, line: line)
            let names = NSMutableArray()
            CGPDFDictionaryApplyFunction(try XCTUnwrap(fonts), { _, object, context in
                var dictionary: CGPDFDictionaryRef?, name: UnsafePointer<CChar>?
                guard let context, CGPDFObjectGetValue(object, .dictionary, &dictionary), let dictionary,
                      CGPDFDictionaryGetName(dictionary, "BaseFont", &name), let name else { return }
                Unmanaged<NSMutableArray>.fromOpaque(context).takeUnretainedValue().add(String(cString: name))
            }, Unmanaged.passUnretained(names).toOpaque())
            XCTAssertGreaterThan(names.count, 0, file: file, line: line)
            XCTAssertTrue(names.allSatisfy { ($0 as? String)?.contains("Mono") == true }, "Non-mono font: \(names)", file: file, line: line)
        }
    }
}
