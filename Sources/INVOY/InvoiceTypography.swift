import AppKit
import SwiftUI

enum InvoiceTypography {
    static func font(size: CGFloat, weight: NSFont.Weight = .regular, monospaced: Bool = false) -> NSFont {
        monospaced ? .monospacedSystemFont(ofSize: size, weight: weight) : .systemFont(ofSize: size, weight: weight)
    }

    // Use mono only for explicitly marked standalone values; digits inside prose keep the body font.
    // PDF measurement and drawing must use the same attributed text.
    static func attributed(_ value: String, size: CGFloat, weight: NSFont.Weight = .regular,
                           monospaced: Bool = false, attributes: [NSAttributedString.Key: Any] = [:]) -> NSAttributedString {
        var attributes = attributes
        attributes[.font] = font(size: size, weight: weight, monospaced: monospaced)
        return NSAttributedString(string: value, attributes: attributes)
    }
}

extension Text {
    static func numeric(_ value: String, size: CGFloat = 13, weight: NSFont.Weight = .regular,
                        monospaced: Bool = false) -> Text {
        Text(value).font(Font(InvoiceTypography.font(size: size, weight: weight, monospaced: monospaced)))
    }
}

struct InvoiceDateField: View {
    let title: String
    @Binding var date: Date

    var body: some View {
        HStack(spacing: 6) {
            Text(title).font(.system(size: 11))
            MonospacedDatePicker(title: title, date: $date).fixedSize()
        }
    }
}

struct MonospacedDatePicker: NSViewRepresentable {
    @Environment(\.invoiceNumericMonospaced) private var numericMono
    let title: String
    @Binding var date: Date
    var fontSize: CGFloat = 13
    var bordered = true

    static func makePicker(monospaced: Bool = true) -> NSDatePicker {
        let picker = NSDatePicker()
        picker.datePickerStyle = .textField
        picker.datePickerElements = .yearMonthDay
        picker.presentsCalendarOverlay = true
        picker.locale = Locale(identifier: "sk_SK")
        picker.timeZone = .current
        picker.font = InvoiceTypography.font(size: 13, monospaced: monospaced)
        picker.isBordered = true
        picker.drawsBackground = true
        return picker
    }

    func makeNSView(context: Context) -> NSDatePicker {
        let picker = Self.makePicker(monospaced: numericMono)
        picker.target = context.coordinator
        picker.action = #selector(Coordinator.changed(_:))
        return picker
    }

    func updateNSView(_ picker: NSDatePicker, context: Context) {
        context.coordinator.date = $date
        picker.font = InvoiceTypography.font(size: fontSize, monospaced: numericMono)
        picker.isBordered = bordered
        picker.drawsBackground = bordered
        if picker.dateValue != date { picker.dateValue = date }
        picker.setAccessibilityLabel(title)
    }

    func makeCoordinator() -> Coordinator { Coordinator(date: $date) }

    final class Coordinator: NSObject {
        var date: Binding<Date>
        init(date: Binding<Date>) { self.date = date }
        @objc func changed(_ picker: NSDatePicker) { date.wrappedValue = picker.dateValue }
    }
}
