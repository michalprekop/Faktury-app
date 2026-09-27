import Foundation

public struct InvoiceAccent: Equatable, Sendable {
    private let rgb: UInt32
    public static let standard = InvoiceAccent(hex: "126657")!

    public init?(hex: String) {
        let value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = value.hasPrefix("#") ? String(value.dropFirst()) : value
        guard digits.count == 6, digits.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789abcdefABCDEF").contains($0) }),
              let rgb = UInt32(digits, radix: 16) else { return nil }
        self.rgb = rgb
    }

    private init(rgb: UInt32) { self.rgb = rgb }
    public var hex: String { String(format: "#%06X", rgb) }
    public var red: Double { Double((rgb >> 16) & 255) / 255 }
    public var green: Double { Double((rgb >> 8) & 255) / 255 }
    public var blue: Double { Double(rgb & 255) / 255 }
    public var luminance: Double {
        func linear(_ value: Double) -> Double { value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }
    public var usesDarkBandText: Bool { (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) }
    public var textOnWhite: InvoiceAccent {
        var color = self
        // Keep small headings readable even when the payment band uses a pale color.
        while 1.05 / (color.luminance + 0.05) < 4.5 {
            let r = UInt32(color.red * 255 * 0.9)
            let g = UInt32(color.green * 255 * 0.9)
            let b = UInt32(color.blue * 255 * 0.9)
            color = InvoiceAccent(rgb: (r << 16) | (g << 8) | b)
        }
        return color
    }
}
