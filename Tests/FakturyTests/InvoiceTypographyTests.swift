import XCTest
import AppKit
import PDFKit
import SwiftUI
import InvoiceCore
@testable import Faktury

final class InvoiceTypographyTests: XCTestCase {
    @MainActor func testInvoiceCanvasKeepsNativeTextSizeWhenWindowWidthChanges() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(Store.seed().invoices[0])
        let host = NSHostingView(rootView: InvoicePaperCanvas(draft: draft).environmentObject(store))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 860, height: 900),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil }

        func datePickers(in view: NSView) -> [NSDatePicker] {
            (view as? NSDatePicker).map { [$0] } ?? view.subviews.flatMap { datePickers(in: $0) }
        }
        for width: CGFloat in [640, 860, 1450] {
            window.setContentSize(NSSize(width: width, height: 900))
            host.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(80))
            host.layoutSubtreeIfNeeded()
            let pickers = datePickers(in: host)
            XCTAssertEqual(pickers.count, 2)
            for picker in pickers {
                XCTAssertEqual(picker.font?.pointSize, 13)
                XCTAssertEqual(picker.convert(picker.bounds, to: host).width, picker.bounds.width, accuracy: 0.01)
            }
        }
        XCTAssertEqual(PaperField("Názov položky", text: .constant("Text")).size, 13)
    }

    @MainActor func testNativeDatePickerUsesMonoAndUpdatesOnlyBoundDate() async throws {
        let picker = MonospacedDatePicker.makePicker()
        XCTAssertTrue(picker.font?.fontName.contains("Mono") == true)
        XCTAssertEqual(picker.datePickerElements, .yearMonthDay)
        XCTAssertEqual(picker.locale?.identifier, "sk_SK")
        var date = Date(timeIntervalSince1970: 1_790_000_000)
        let coordinator = MonospacedDatePicker.Coordinator(date: Binding(get: { date }, set: { date = $0 }))
        let updated = date.addingTimeInterval(86400)
        picker.dateValue = updated
        coordinator.changed(picker)
        XCTAssertEqual(date, updated)
    }

    func testNumbersInsideTextKeepTheBodyFont() throws {
        let body = InvoiceTypography.font(size: 12, weight: .medium)
        for value in ["Hosting PHP 8.2 na obdobie 01.09.2026 - 30.09.2026",
                      "Suma 1\u{00A0}234,50 € je splatná do 30 dní.",
                      "IČ DPH: SK2120245644 · Púchov 02001",
                      "24 faktúr", "Splatnosť: 14 dní", "Faktúra 2026025", "DPH 23 %"] {
            let text = InvoiceTypography.attributed(value, size: 12, weight: .medium)
            XCTAssertEqual(text.string, value)
            for index in 0..<text.length {
                let font = try XCTUnwrap(text.attribute(.font, at: index, effectiveRange: nil) as? NSFont)
                XCTAssertEqual(font, body, value)
            }
        }
    }

    func testStandaloneValuesUseMonoAndRetainWeight() throws {
        for weight in [NSFont.Weight.regular, .medium, .semibold] {
            let expected = InvoiceTypography.font(size: 17, weight: weight, monospaced: true)
            for value in ["FA-2026/001", "2026025", "1\u{00A0}234,50 €", "30.09.2026", "2,5 ks", "23 %", "SK12 3456 7890"] {
                let text = InvoiceTypography.attributed(value, size: 17, weight: weight, monospaced: true)
                XCTAssertEqual(text.string, value)
                for index in 0..<text.length {
                    let font = try XCTUnwrap(text.attribute(.font, at: index, effectiveRange: nil) as? NSFont)
                    XCTAssertEqual(font, expected, value)
                }
            }
        }
        let widths = (0...9).map { InvoiceTypography.attributed(String($0), size: 12, monospaced: true).size().width }
        for width in widths { XCTAssertEqual(width, widths[0], accuracy: 0.001) }
    }

    @MainActor func testPDFEmbedsMonoDigitsAndKeepsPaymentDetailsOnOnePage() async throws {
        var invoice = Store.seed().invoices[0]
        invoice.items[0].name = "Hosting PHP 8.2: 01.09.2026 - 30.09.2026"
        invoice.items[0].unitPrice = Decimal(string: "12345678.90")!
        invoice.paid = 0
        let document = try XCTUnwrap(PDFDocument(data: InvoicePDF.render(invoice)))
        XCTAssertEqual(document.pageCount, 1)
        let page = try XCTUnwrap(document.page(at: 0))
        let text = try XCTUnwrap(page.string)
        let pageRef = try XCTUnwrap(page.pageRef)
        let dictionary = try XCTUnwrap(pageRef.dictionary)
        var resources: CGPDFDictionaryRef?
        var fonts: CGPDFDictionaryRef?
        XCTAssertTrue(CGPDFDictionaryGetDictionary(dictionary, "Resources", &resources))
        XCTAssertTrue(CGPDFDictionaryGetDictionary(try XCTUnwrap(resources), "Font", &fonts))
        // PDFKit's attributedString reconstructs hidden system fonts incorrectly; inspect the embedded resources.
        let fontNames = NSMutableArray()
        CGPDFDictionaryApplyFunction(try XCTUnwrap(fonts), { _, object, context in
            var dictionary: CGPDFDictionaryRef?
            var name: UnsafePointer<CChar>?
            guard let context, CGPDFObjectGetValue(object, .dictionary, &dictionary), let dictionary,
                  CGPDFDictionaryGetName(dictionary, "BaseFont", &name), let name else { return }
            Unmanaged<NSMutableArray>.fromOpaque(context).takeUnretainedValue().add(String(cString: name))
        }, Unmanaged.passUnretained(fontNames).toOpaque())
        for weight in ["Regular", "Medium", "Semibold"] {
            XCTAssertTrue(fontNames.contains { ($0 as? String)?.contains("SFNSMono-\(weight)") == true }, "Missing embedded mono weight: \(fontNames)")
        }
        XCTAssertGreaterThan(text.filter(\.isNumber).count, 100)
        XCTAssertTrue(text.contains("Hosting PHP"))
        XCTAssertTrue(text.contains("IBAN"))
        let expectedQR = try XCTUnwrap(PaymentQR.make(for: invoice))
        XCTAssertEqual(try Verification.scanQR(document), [expectedQR.payload])
    }
}
