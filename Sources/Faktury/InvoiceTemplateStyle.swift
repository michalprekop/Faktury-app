import SwiftUI
import AppKit

private struct InvoiceMonospacedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var invoiceMonospaced: Bool {
        get { self[InvoiceMonospacedKey.self] }
        set { self[InvoiceMonospacedKey.self] = newValue }
    }
}

struct PaperText: View {
    @Environment(\.invoiceMonospaced) private var mono
    let value: String
    var size: CGFloat = 13
    var weight: NSFont.Weight = .regular
    var monospaced = false

    init(_ value: String, size: CGFloat = 13, weight: NSFont.Weight = .regular, monospaced: Bool = false) {
        self.value = value; self.size = size; self.weight = weight; self.monospaced = monospaced
    }

    var body: some View {
        Text(value).font(Font(InvoiceTypography.font(size: size, weight: weight, monospaced: mono || monospaced)))
    }
}
