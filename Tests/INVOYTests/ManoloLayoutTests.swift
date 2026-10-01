import XCTest
import PDFKit
import InvoiceCore
@testable import INVOY

final class ManoloLayoutTests: XCTestCase {
    @MainActor func testPaymentContentHasEqualGapsInEditorAndPDF() {
        var invoice = Store.seed().invoices[0]
        for symbol in ["2026003", "1234567890", ""] {
            invoice.variableSymbol = symbol
            for scale: CGFloat in [1, 0.75] {
                let width: CGFloat = scale == 1 ? 680 : 503.28
                let columns = ManoloPaymentColumns.make(invoice, width: width, scale: scale,
                                                       monospaced: scale == 1)
                let gaps = zip(columns, columns.dropFirst()).map { $1.x - $0.x - $0.width }
                XCTAssertEqual(gaps[0], gaps[1], accuracy: 0.001)
                XCTAssertEqual(gaps[1], gaps[2], accuracy: 0.001)
                XCTAssertGreaterThanOrEqual(gaps[0], 16 * scale - 0.001)
                XCTAssertEqual(columns.last!.x + columns.last!.width, width, accuracy: 0.001)
            }
        }
    }

    @MainActor func testFooterStaysAtBottomOfEveryPDFPage() throws {
        var invoice = Store.seed().invoices[0]
        invoice.templateOverride = .manoloBay
        for count in [1, 3, 40] {
            invoice.items = (1...count).map { index in
                var item = InvoiceItem()
                item.name = "Položka \(index)"
                item.unitPrice = 100
                return item
            }
            let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
            if count == 40 { XCTAssertGreaterThan(document.pageCount, 1) }
            for index in 0..<document.pageCount {
                let page = try XCTUnwrap(document.page(at: index))
                let footer = try XCTUnwrap(document.findString(ManoloInvoiceBrand.contacts[0],
                    withOptions: []).first { $0.pages.contains(page) })
                let bounds = footer.bounds(for: page)
                XCTAssertGreaterThan(bounds.minY, 25)
                XCTAssertLessThan(bounds.maxY, 45, "Footer must stay at the bottom with \(count) items")
            }
        }
    }
}
