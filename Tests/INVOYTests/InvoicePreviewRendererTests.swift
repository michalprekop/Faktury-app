import XCTest
import PDFKit
import InvoiceCore
@testable import INVOY

final class InvoicePreviewRendererTests: XCTestCase {
    @MainActor func testPreviewRendersOffMainThreadReusesUnchangedResultAndCancelsSupersededWork() async throws {
        var renders = 0
        let renderer = InvoicePreviewRenderer { request in
            XCTAssertFalse(Thread.isMainThread, "Preview drawing must not block tab clicks")
            renders += 1
            return Data(request.invoice.number.utf8)
        }
        var invoice = Store.seed().invoices[0]
        let request = InvoicePreviewRequest(invoice: invoice, accent: .standard, template: .mono01)
        let first = try await renderer.data(for: request)
        let again = try await renderer.data(for: request)
        XCTAssertEqual(first, again)
        XCTAssertEqual(renders, 1, "Returning to Appearance must reuse its unchanged PDF")
        invoice.number = "2026099"
        let updated = InvoicePreviewRequest(invoice: invoice, accent: .standard, template: .mono01)
        let changed = try await renderer.data(for: updated)
        XCTAssertEqual(changed, Data("2026099".utf8))
        XCTAssertEqual(renders, 2)
        invoice.number = "2026100"
        let cancelled = InvoicePreviewRequest(invoice: invoice, accent: .standard, template: .mono01)
        let task = Task { try await renderer.data(for: cancelled) }
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("A superseded request must not draw or replace the current preview")
        } catch is CancellationError { }
        XCTAssertEqual(renders, 2)
    }

    @MainActor func testBackgroundPreviewPreservesEveryTemplateAndPaymentQR() async throws {
        let renderer = InvoicePreviewRenderer()
        var invoice = Store.seed().invoices[0]
        invoice.paid = 0
        let expectedQR = try XCTUnwrap(PaymentQR.make(for: invoice)).payload
        for template in InvoiceTemplate.allCases {
            let data = try await renderer.data(for: .init(invoice: invoice, accent: .standard, template: template))
            let pdf = try XCTUnwrap(PDFDocument(data: data))
            XCTAssertEqual(pdf.pageCount, 1)
            XCTAssertTrue(pdf.string?.contains(invoice.number) == true)
            XCTAssertEqual(try Verification.scanQR(pdf), [expectedQR])
        }
    }
}
