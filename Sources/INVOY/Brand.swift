import SwiftUI
import AppKit

/// The same approved palette and vector artwork as the public website.
enum InvoyBrand {
    static let controlHeight: CGFloat = 40
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
            .frame(minHeight: InvoyBrand.controlHeight)
            .background(InvoyBrand.yellow, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(configuration.isPressed ? 0.08 : 0)))
            .opacity(enabled ? 1 : 0.45)
    }
}

struct BrandDropdown<Content: View>: View {
    let title: String
    let value: String
    @ViewBuilder let content: Content

    var body: some View {
        Menu {
            content.pickerStyle(.inline).labelsHidden()
        } label: {
            Text(value).lineLimit(1)
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden)
        .font(.system(size: 13)).foregroundStyle(InvoyBrand.ink)
        .padding(.leading, 12).padding(.trailing, 30)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: InvoyBrand.controlHeight)
        .background(InvoyBrand.canvas, in: RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .trailing) {
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                .foregroundStyle(InvoyBrand.ink).padding(.trailing, 12).allowsHitTesting(false)
        }
        .accessibilityLabel(title).accessibilityValue(value).help(value)
    }
}

struct BrandSegment: View {
    let title: String
    var symbol: String? = nil
    var iconOnly = true
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if let symbol {
                    if iconOnly { Image(systemName: symbol) }
                    else { Label(title, systemImage: symbol).lineLimit(1) }
                }
                else { Text(title).lineLimit(1) }
            }
            .font(.system(size: 13, weight: selected ? .semibold : .regular))
            .foregroundStyle(InvoyBrand.ink)
            .padding(.horizontal, symbol == nil ? 12 : 10)
            .frame(maxWidth: .infinity, minHeight: InvoyBrand.controlHeight - 6)
            .background(selected ? InvoyBrand.yellow : .clear, in: RoundedRectangle(cornerRadius: 7))
        }.buttonStyle(.plain).accessibilityLabel(title)
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct BrandIconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(InvoyBrand.ink)
            .frame(width: InvoyBrand.controlHeight, height: InvoyBrand.controlHeight)
            .background(InvoyBrand.canvas, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(configuration.isPressed ? 0.06 : 0)))
            .opacity(enabled ? 1 : 0.45)
    }
}
