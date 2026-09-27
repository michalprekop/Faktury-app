import Foundation
import AppKit
import PDFKit
import Vision

// Decode rendered PDF pages locally; never send invoice contents to a QR service.
var results: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
    guard let pdf = PDFDocument(url: URL(fileURLWithPath: path)) else { fatalError("Invalid PDF: \(path)") }
    for index in 0..<pdf.pageCount {
        let page = pdf.page(at: index)!
        let image = page.thumbnail(of: NSSize(width: 1786, height: 2526), for: .mediaBox)
        guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("Render failed") }
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.qr]
        try VNImageRequestHandler(cgImage: cgImage).perform([request])
        results.append(["file": path, "page": index + 1, "codes": (request.results ?? []).compactMap(\.payloadStringValue)])
    }
}
let data = try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
