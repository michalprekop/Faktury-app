import AppKit
import SwiftUI
import Vision
import XCTest
import InvoiceCore
@testable import INVOY

final class PaymentSummaryReadabilityTests: XCTestCase {
    @MainActor func testPaymentLabelsRemainReadableInTheEditor() async throws {
        let invoice = Store.seed().invoices[0]
        let host = NSHostingView(rootView: ManoloPaymentSummary(invoice: invoice)
            .environment(\.colorScheme, .light).frame(width: 716).background(.white))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 716, height: 72),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil }
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(180))
        host.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        if let path = ProcessInfo.processInfo.environment["INVOY_PAYMENT_QA_OUTPUT"] {
            try bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        try VNImageRequestHandler(cgImage: try XCTUnwrap(bitmap.cgImage)).perform([request])
        let observations = request.results ?? []
        for title in ["IBAN", "Variabilný symbol", "Dátum splatnosti", "Suma na úhradu"] {
            let label = try XCTUnwrap(observations.first {
                $0.topCandidates(1).first?.string.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
                    == title.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            }, "Missing label: \(title)")
            XCTAssertGreaterThan(label.boundingBox.height * host.bounds.height, 8, "Label shrank: \(title)")
        }
    }
}
