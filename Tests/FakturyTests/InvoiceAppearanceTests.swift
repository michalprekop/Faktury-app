import XCTest
import AppKit
import PDFKit
import InvoiceCore
@testable import Faktury

final class InvoiceAppearanceTests: XCTestCase {
    @MainActor func testPDFGeneratesPaymentQRCodeFromLatestInvoiceEdits() async throws {
        let draft = InvoiceDraft(Store.seed().invoices[0])
        draft.invoice.items[0].unitPrice = Decimal(string: "250.50")!
        draft.invoice.paid = 50
        draft.invoice.variableSymbol = "2026099"
        for format in [PaymentQRFormat.payBySquare, .qrPlatba] {
            draft.invoice.paymentQRFormat = format
            let expected = try XCTUnwrap(PaymentQR.make(for: draft.invoice))
            let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(draft.invoice)))
            XCTAssertEqual(document.pageCount, 1)
            XCTAssertEqual(try Verification.scanQR(document), [expected.payload])
            XCTAssertEqual(draft.invoice.remaining, Decimal(string: "200.50"))
        }
    }

    @MainActor func testCustomAccentIsRenderedInFinalPDF() async throws {
        let invoice = Store.seed().invoices[0]
        for hex in ["2463A8", "B83A32", "F5E663"] {
            let accent = InvoiceAccent(hex: hex)!
            let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice, accentColor: accent)))
            XCTAssertEqual(document.pageCount, 1)
            XCTAssertTrue(document.string?.contains(invoice.number) == true)
            let page = try XCTUnwrap(document.page(at: 0))
            let context = try XCTUnwrap(CGContext(data: nil, width: 595, height: 842, bitsPerComponent: 8, bytesPerRow: 595 * 4,
                                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.drawPDFPage(try XCTUnwrap(page.pageRef))
            let pixels = try XCTUnwrap(context.data).assumingMemoryBound(to: UInt8.self)
            let matchingPixels = (0..<context.height).filter { y in
                let offset = y * context.bytesPerRow + (context.width / 2) * 4
                return abs(Double(pixels[offset]) / 255 - accent.red) < 0.035 && abs(Double(pixels[offset + 1]) / 255 - accent.green) < 0.035 && abs(Double(pixels[offset + 2]) / 255 - accent.blue) < 0.035
            }.count
            XCTAssertGreaterThan(matchingPixels, 20, "Payment band must use \(hex) in the final PDF pass")
        }
    }

    @MainActor func testColorAutosavesWithoutModifyingInvoiceData() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let original = store.database.invoices
        var settings = store.database.settings
        settings.invoiceAccentHex = "#2463A8"
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.flushSettings())
        let restored = Store(dataDirectory: directory, initialDatabase: Store.seed())
        XCTAssertEqual(restored.database.settings.invoiceAccent.hex, "#2463A8")
        XCTAssertEqual(restored.database.invoices, original)
    }
}
