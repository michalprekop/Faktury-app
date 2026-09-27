import Foundation
import CLZMA

public struct PaymentQR {
    public let format: PaymentQRFormat
    public let payload: String
    public let beneficiary: String
    public var label: String { format == .qrPlatba ? "QR Platba" : "PAY by square" }

    public static func resolvedFormat(for invoice: Invoice) -> PaymentQRFormat {
        let choice = invoice.paymentQRFormat ?? .automatic
        guard choice == .automatic else { return choice }
        let country = invoice.customer.country.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX")).trimmingCharacters(in: .whitespacesAndNewlines)
        return ["cz", "cze", "cesko", "ceska republika", "czechia", "czech republic"].contains(country) ? .qrPlatba : .payBySquare
    }

    public static func make(for invoice: Invoice) throws -> PaymentQR? {
        let format = resolvedFormat(for: invoice)
        guard format != .disabled, invoice.remaining > 0,
              ["", "Bankový prevod"].contains(invoice.paymentMethod) else { return nil }
        guard let account = invoice.account, account.isValid else { throw DataError.invalid("QR platba: vyberte účet s platným IBAN.") }
        let holder = clean(account.holderName ?? "")
        let beneficiary = holder.isEmpty ? clean(invoice.supplier.name) : holder
        let nameLimit = format == .qrPlatba ? 35 : 70
        guard !beneficiary.isEmpty, beneficiary.count <= nameLimit else {
            throw DataError.invalid("QR platba: meno majiteľa účtu musí mať 1 až \(nameLimit) znakov.")
        }
        let iban = account.iban.filter { !$0.isWhitespace }.uppercased()
        let bic = clean(account.swift).uppercased()
        guard bic.isEmpty || bic.range(of: #"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$"#, options: .regularExpression) != nil else {
            throw DataError.invalid("QR platba: skontrolujte SWIFT / BIC účtu.")
        }
        let currency = invoice.currency.uppercased()
        guard ["EUR", "CZK", "USD", "GBP"].contains(currency) else { throw DataError.invalid("QR platba: nepodporovaná mena.") }
        let symbols = [(invoice.variableSymbol, 10), (invoice.constantSymbol, format == .qrPlatba ? 10 : 4), (invoice.specificSymbol, 10)]
        for (value, limit) in symbols {
            guard value.isEmpty || (value.count <= limit && value.range(of: #"^[0-9]+$"#, options: .regularExpression) != nil) else {
                throw DataError.invalid("QR platba: skontrolujte variabilný, konštantný a špecifický symbol.")
            }
        }
        let amount = decimal(invoice.remaining)
        guard amount.count <= (format == .qrPlatba ? 10 : 15) else { throw DataError.invalid("QR platba: suma presahuje limit formátu.") }
        let note = "Faktura \(clean(invoice.number))"
        let payload: String
        if format == .qrPlatba {
            var fields = [("ACC", iban + (bic.isEmpty ? "" : "+" + bic)), ("AM", amount), ("CC", currency), ("RN", beneficiary), ("MSG", String(note.prefix(60))), ("X-VS", invoice.variableSymbol), ("X-KS", invoice.constantSymbol), ("X-SS", invoice.specificSymbol)]
            fields.removeAll { $0.1.isEmpty }
            payload = "SPD*1.0*" + fields.map { "\($0.0):\(escaped($0.1))" }.joined(separator: "*")
        } else {
            // One payment, one selected account; no standing order or direct debit.
            // No execution date: payment is immediate, including overdue invoices.
            let fields = ["", "1", "1", amount, currency, "", invoice.variableSymbol,
                          invoice.constantSymbol, invoice.specificSymbol, "", String(note.prefix(140)),
                          "1", iban, bic, "0", "0", beneficiary, "", ""]
            payload = try encodeBySquare(fields.joined(separator: "\t"))
        }
        return PaymentQR(format: format, payload: payload, beneficiary: beneficiary)
    }

    static func clean(_ value: String) -> String {
        value.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    static func decimal(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.usesGroupingSeparator = false
        return formatter.string(from: NSDecimalNumber(decimal: rounded(value)))!
    }

    static func escaped(_ value: String) -> String {
        // SPAYD uses percent-encoded UTF-8 for non-ASCII characters and delimiters.
        value.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 $+-,./:"))!
    }

    static func encodeBySquare(_ sequence: String) throws -> String {
        let bytes = Array(sequence.utf8)
        guard bytes.count <= 550 else { throw DataError.invalid("QR platba: údaje sú príliš dlhé.") }
        let crc = bytes.withUnsafeBufferPointer { lzma_crc32($0.baseAddress, $0.count, 0) }
        var input = (0..<4).map { UInt8(truncatingIfNeeded: crc >> ($0 * 8)) }
        input += bytes
        var options = lzma_options_lzma()
        guard lzma_lzma_preset(&options, 6) == 0 else { throw DataError.invalid("QR platbu sa nepodarilo vytvoriť.") }
        options.dict_size = 1 << 17
        options.lc = 3
        options.lp = 0
        options.pb = 2
        var compressed = [UInt8](repeating: 0, count: 4096)
        var count = 0
        let status = withUnsafeMutablePointer(to: &options) { pointer in
            let filters = [lzma_filter(id: QR_LZMA1_FILTER, options: UnsafeMutableRawPointer(pointer)), lzma_filter(id: UInt64.max, options: nil)]
            return filters.withUnsafeBufferPointer { filter in
                input.withUnsafeBufferPointer { source in
                    compressed.withUnsafeMutableBufferPointer { target in
                        lzma_raw_buffer_encode(filter.baseAddress, nil, source.baseAddress, source.count, target.baseAddress, &count, target.count)
                    }
                }
            }
        }
        guard status == LZMA_OK else { throw DataError.invalid("QR platbu sa nepodarilo vytvoriť.") }
        // PAY/type 0, version 0, document 0, reserved 0, then little-endian length.
        let packet: [UInt8] = [0, 0, UInt8(truncatingIfNeeded: input.count), UInt8(truncatingIfNeeded: input.count >> 8)] + compressed.prefix(count)
        return base32Hex(packet)
    }

    static func base32Hex(_ bytes: [UInt8]) -> String {
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUV".utf8)
        var result: [UInt8] = []
        var buffer: UInt32 = 0
        var bits = 0
        for byte in bytes {
            buffer = (buffer << 8) | UInt32(byte)
            bits += 8
            while bits >= 5 {
                bits -= 5
                result.append(alphabet[Int((buffer >> bits) & 31)])
            }
        }
        if bits > 0 { result.append(alphabet[Int((buffer << (5 - bits)) & 31)]) }
        return String(decoding: result, as: UTF8.self)
    }
}
