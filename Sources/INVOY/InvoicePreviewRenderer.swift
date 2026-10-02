import AppKit
import InvoiceCore

struct InvoicePreviewRequest: Equatable {
    let invoice: Invoice
    let accent: InvoiceAccent
    let template: InvoiceTemplate
}

/// PDF drawing has its own graphics context; only attaching the result to PDFView needs the UI thread.
/// Keep a small in-memory cache so returning to Appearance does not redraw an unchanged invoice.
actor InvoicePreviewRenderer {
    static let shared = InvoicePreviewRenderer()
    private var cache: [(InvoicePreviewRequest, Data)] = []
    private let render: (InvoicePreviewRequest) -> Data

    init(render: @escaping (InvoicePreviewRequest) -> Data = { request in
        var invoice = request.invoice
        invoice.templateOverride = request.template
        return InvoicePDF.render(invoice, accentColor: request.accent)
    }) {
        self.render = render
    }

    func data(for request: InvoicePreviewRequest) async throws -> Data {
        try Task.checkCancellation()
        if let entry = cache.first(where: { $0.0 == request }) { return entry.1 }
        // Coalesce color/field edits without holding up tab selection or other mouse events.
        try await Task.sleep(for: .milliseconds(80))
        try Task.checkCancellation()
        if let entry = cache.first(where: { $0.0 == request }) { return entry.1 }
        let data = autoreleasepool { render(request) }
        try Task.checkCancellation()
        cache.append((request, data))
        if cache.count > 4 { cache.removeFirst() }
        return data
    }
}
