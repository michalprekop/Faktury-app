import AppKit

enum InvoiceFooterLayout {
    /// Match the editor's content-sized items with equal space between them.
    static func columns(_ values: [String], width: CGFloat, size: CGFloat, monospaced: Bool = false) -> [(x: CGFloat, width: CGFloat)] {
        guard !values.isEmpty else { return [] }
        let measured = values.map { ceil(InvoiceTypography.attributed($0, size: size, monospaced: monospaced).size().width) + 1 }
        let available = max(1, width - CGFloat(values.count - 1) * 12)
        let scale = min(1, available / max(1, measured.reduce(0, +)))
        let widths = measured.map { $0 * scale }
        let gap = values.count > 1 ? (width - widths.reduce(0, +)) / CGFloat(values.count - 1) : 0
        var x: CGFloat = 0
        return widths.map { itemWidth in
            defer { x += itemWidth + gap }
            return (x, itemWidth)
        }
    }
}
