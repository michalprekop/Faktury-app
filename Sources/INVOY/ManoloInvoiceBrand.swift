import AppKit
import SwiftUI

/// Versioned, supplied artwork shared with the web renderer.
enum ManoloInvoiceBrand {
    static let contacts = ["Vystavil: Dominika Vašek", "Web: manolobay.com", "dominika@manolobay.com"]
    static let highlight = NSColor(srgbRed: 242 / 255, green: 238 / 255, blue: 234 / 255, alpha: 1)

    static func data(_ filename: String) -> Data? {
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("manolo-bay-v1/\(filename)")
        // Command-line PDF verification and XCTest run outside the installed bundle.
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("web/public/templates/manolo-bay-v1/\(filename)")
        return [bundled, source].compactMap { $0 }.compactMap { try? Data(contentsOf: $0) }.first
    }

    static func image(_ filename: String) -> NSImage? { data(filename).flatMap(NSImage.init(data:)) }
}

struct ManoloInvoiceBackground: View {
    var body: some View {
        if let background = ManoloInvoiceBrand.image("background.png") {
            Image(nsImage: background).resizable().scaledToFit()
                .frame(width: 450, height: 450 * background.size.height / background.size.width)
                .allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}

struct ManoloInvoiceHeader: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                if let logo = ManoloInvoiceBrand.image("logo.svg") {
                    Image(nsImage: logo).resizable().scaledToFit()
                        .frame(width: min(410, proxy.size.width * 0.72), height: 81)
                        .offset(y: 45).accessibilityLabel("Manolo & Bay")
                }
            }.frame(width: proxy.size.width, height: 150, alignment: .top)
        }.frame(height: 150)
    }
}
