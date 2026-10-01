import AppKit
import SwiftUI
import InvoiceCore

extension InvoiceAccent {
    var nsColor: NSColor { NSColor(srgbRed: red, green: green, blue: blue, alpha: 1) }
    init?(color: Color) {
        guard let rgb = NSColor(color).usingColorSpace(.sRGB) else { return nil }
        func channel(_ value: CGFloat) -> Int { Int((min(1, max(0, value)) * 255).rounded()) }
        self.init(hex: String(format: "#%02X%02X%02X", channel(rgb.redComponent), channel(rgb.greenComponent), channel(rgb.blueComponent)))
    }
}

struct InvoiceAppearanceSettings: View {
    @EnvironmentObject private var store: Store
    @Binding var settings: InvoiceCore.Settings
    let invoice: Invoice
    private let swatches = [
        ("Zelená", "#126657"), ("Modrá", "#2463A8"), ("Fialová", "#7453A6"),
        ("Ružová", "#B8325C"), ("Červená", "#B83A32"), ("Oranžová", "#C15B18"), ("Tmavá", "#303B44")
    ]
    private var color: Binding<Color> {
        Binding(get: { Color(nsColor: settings.invoiceAccent.nsColor) }, set: {
            if let accent = InvoiceAccent(color: $0) { settings.invoiceAccentHex = accent.hex }
        })
    }
    var body: some View {
        HStack(alignment: .top, spacing: 32) {
            VStack(alignment: .leading, spacing: 20) {
                Text("Šablóna faktúry").font(.system(size: 18, weight: .semibold))
                if let templates = store.cloudTemplates {
                    Picker("Šablóna faktúry", selection: Binding(get: { settings.cloudTemplateID ?? "" }, set: { id in
                        settings.cloudTemplateID = id
                        settings.invoiceTemplate = templates.first(where: { $0.id == id })?.layout
                    })) { ForEach(templates) { Text($0.name).tag($0.id) } }.labelsHidden()
                } else {
                Picker("Šablóna faktúry", selection: Binding(get: { settings.defaultInvoiceTemplate }, set: {
                    settings.invoiceTemplate = $0 == .boringDefault01 ? nil : $0
                })) {
                    ForEach(InvoiceTemplate.allCases, id: \.self) { Text($0.title).tag($0) }
                }.labelsHidden()
                    .help("Platí pre všetky faktúry, ktoré nemajú vybranú vlastnú šablónu.")
                }
                Divider()
                Group {
                    Text("Farba zvýraznení").font(.system(size: 18, weight: .semibold))
                    HStack(spacing: 8) {
                        ForEach(swatches, id: \.1) { name, hex in
                            let accent = InvoiceAccent(hex: hex)!
                            Button { settings.invoiceAccentHex = hex } label: {
                                Circle().fill(Color(nsColor: accent.nsColor))
                                    .overlay {
                                        if settings.invoiceAccent == accent {
                                            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                                        }
                                    }.frame(width: 26, height: 26)
                            }.buttonStyle(.plain).help(name).accessibilityLabel(name)
                        }
                    }
                    ColorPicker("Vlastná farba", selection: color, supportsOpacity: false)
                    HStack {
                        Text(settings.invoiceAccent.hex).font(.system(size: 12, design: .monospaced)).foregroundStyle(.secondary)
                        Spacer()
                        IconButton("Obnoviť pôvodnú farbu", "arrow.counterclockwise") { settings.invoiceAccentHex = nil }
                            .disabled(settings.invoiceAccent == .standard)
                    }
                }.disabled(settings.defaultInvoiceTemplate == .mono01)
                    .help("Farba zvýraznení patrí k šablóne Boring default 01. Mono 01 je čiernobiela.")
            }.frame(width: 250)
            LivePreview(invoice: invoice, showsZoomControls: true, accentOverride: settings.invoiceAccent,
                        templateOverride: settings.defaultInvoiceTemplate)
                .frame(width: 520, height: 730)
        }
    }
}
