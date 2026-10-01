import SwiftUI
import AppKit

/// The same approved palette and vector artwork as the public website.
enum InvoyBrand {
    static let yellow = Color(red: 245 / 255, green: 1, blue: 54 / 255)
    static let ink = Color(red: 25 / 255, green: 26 / 255, blue: 23 / 255)
    static let canvas = Color(red: 233 / 255, green: 231 / 255, blue: 224 / 255)
    static let surface = Color(red: 248 / 255, green: 247 / 255, blue: 242 / 255)

    static func image(_ name: String) -> NSImage {
        guard let url = Bundle.main.url(forResource: name, withExtension: "svg"),
              let image = NSImage(contentsOf: url) else { return NSImage() }
        return image
    }
}

struct BrandWordmark: View {
    var height: CGFloat = 30
    var body: some View {
        Image(nsImage: InvoyBrand.image("invoy-wordmark"))
            .resizable().aspectRatio(contentMode: .fit)
            .frame(width: height * 2.91246, height: height)
            .accessibilityLabel("INVOY.")
    }
}

struct BrandIcon: View {
    var size: CGFloat = 104
    var body: some View {
        Image(nsImage: InvoyBrand.image("invoy-icon-yellow"))
            .resizable().aspectRatio(contentMode: .fit)
            .frame(width: size, height: size).accessibilityLabel("INVOY.")
    }
}

struct BrandButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    @Environment(\.controlSize) private var size

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(InvoyBrand.ink)
            .padding(.horizontal, size == .large ? 17 : 13)
            .frame(minHeight: size == .large ? 38 : 32)
            .background(InvoyBrand.yellow, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(configuration.isPressed ? 0.08 : 0)))
            .opacity(enabled ? 1 : 0.45)
    }
}
