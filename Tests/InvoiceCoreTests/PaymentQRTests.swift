import XCTest
import CLZMA
@testable import InvoiceCore

final class PaymentQRTests: XCTestCase {
    func invoice() -> Invoice {
        var invoice = Invoice()
        invoice.number = "2026023"
        invoice.variableSymbol = "002026023"
        invoice.supplier.name = "Michal Prekop"
        invoice.customer.name = "Klient"
        invoice.items[0].name = "Služba"
        invoice.items[0].unitPrice = 2200
        var account = BankAccount()
        account.name = "Wise"
        account.iban = "BE34 9670 2736 6490"
        account.swift = "TRWIBEB1XXX"
        invoice.account = account
        return invoice
    }

    func decode(_ payload: String) throws -> [String] {
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUV")
        var packet: [UInt8] = []
        var bits = 0
        var buffer: UInt32 = 0
        for char in payload {
            buffer = (buffer << 5) | UInt32(try XCTUnwrap(alphabet.firstIndex(of: char)))
            bits += 5
            if bits >= 8 { bits -= 8; packet.append(UInt8(truncatingIfNeeded: buffer >> bits)) }
        }
        XCTAssertEqual(Array(packet.prefix(2)), [0, 0])
        let expectedLength = Int(packet[2]) | (Int(packet[3]) << 8)
        let compressed = Array(packet.dropFirst(4))
        var options = lzma_options_lzma()
        XCTAssertEqual(lzma_lzma_preset(&options, 6), 0)
        options.dict_size = 1 << 17; options.lc = 3; options.lp = 0; options.pb = 2
        var result = [UInt8](repeating: 0, count: 65536)
        var inputPosition = 0
        var outputPosition = 0
        let status = withUnsafeMutablePointer(to: &options) { pointer in
            let filters = [lzma_filter(id: QR_LZMA1_FILTER, options: UnsafeMutableRawPointer(pointer)), lzma_filter(id: UInt64.max, options: nil)]
            return filters.withUnsafeBufferPointer { filter in
                compressed.withUnsafeBufferPointer { source in
                    result.withUnsafeMutableBufferPointer { target in
                        lzma_raw_buffer_decode(filter.baseAddress, nil, source.baseAddress, &inputPosition, source.count, target.baseAddress, &outputPosition, target.count)
                    }
                }
            }
        }
        XCTAssertEqual(status, LZMA_OK)
        XCTAssertEqual(outputPosition, expectedLength)
        let data = Array(result[4..<outputPosition])
        let checksum = data.withUnsafeBufferPointer { lzma_crc32($0.baseAddress, $0.count, 0) }
        XCTAssertEqual(Array(result.prefix(4)), (0..<4).map { UInt8(truncatingIfNeeded: checksum >> ($0 * 8)) })
        return String(decoding: data, as: UTF8.self).components(separatedBy: "\t")
    }

    func testSlovakQRContainsOnlySelectedAccountAndRemainingAmount() throws {
        var i = invoice()
        i.paid = Decimal(string: "199.99")!
        i.constantSymbol = "0308"
        i.specificSymbol = "0123"
        i.account?.holderName = "Ján Novák"
        let qr = try XCTUnwrap(PaymentQR.make(for: i))
        XCTAssertEqual(qr.format, .payBySquare)
        XCTAssertEqual(try decode(qr.payload), ["", "1", "1", "2000.01", "EUR", "", "002026023", "0308", "0123", "", "Faktura 2026023", "1", "BE34967027366490", "TRWIBEB1XXX", "0", "0", "Ján Novák", "", ""])
    }

    func testPaidDisabledAndNonTransferInvoicesHaveNoCode() throws {
        var i = invoice()
        i.paid = i.total
        XCTAssertNil(try PaymentQR.make(for: i))
        i.paid = i.total + 50
        XCTAssertNil(try PaymentQR.make(for: i))
        i.paid = 0
        for method in ["Hotovosť", "Platobná karta", "Dobierka"] {
            i.paymentMethod = method
            XCTAssertNil(try PaymentQR.make(for: i))
        }
        i.paymentMethod = ""
        XCTAssertNotNil(try PaymentQR.make(for: i))
        i.paymentQRFormat = .disabled
        XCTAssertNil(try PaymentQR.make(for: i))
    }

    func testCzechAutomaticAndManualOverride() throws {
        var i = invoice()
        i.customer.country = "Česká republika"
        i.account?.holderName = "Ján * 100%"
        let payload = try XCTUnwrap(PaymentQR.make(for: i)).payload
        XCTAssertTrue(payload.hasPrefix("SPD*1.0*"))
        XCTAssertTrue(payload.contains("ACC:BE34967027366490+TRWIBEB1XXX"))
        XCTAssertTrue(payload.contains("RN:J%C3%A1n %2A 100%25"))
        XCTAssertTrue(payload.contains("AM:2200.00*CC:EUR"))
        XCTAssertTrue(payload.contains("X-VS:002026023"))
        XCTAssertFalse(payload.contains("ALT-ACC"))
        i.paymentQRFormat = .payBySquare
        XCTAssertEqual(try XCTUnwrap(PaymentQR.make(for: i)).format, .payBySquare)
        i.customer.country = "Slovensko"
        i.paymentQRFormat = .qrPlatba
        XCTAssertEqual(try XCTUnwrap(PaymentQR.make(for: i)).format, .qrPlatba)
    }

    func testInvalidPaymentDataDoesNotProduceQR() throws {
        var i = invoice()
        i.account?.iban = "SK0011000000002941251513"
        XCTAssertThrowsError(try PaymentQR.make(for: i))
        i = invoice(); i.variableSymbol = "123\t456"
        XCTAssertThrowsError(try PaymentQR.make(for: i))
        i = invoice(); i.account?.swift = "INVALID"
        XCTAssertThrowsError(try PaymentQR.make(for: i))
        i = invoice(); i.supplier.name = " "
        XCTAssertThrowsError(try PaymentQR.make(for: i))
        i = invoice(); i.account?.holderName = String(repeating: "x", count: 71)
        XCTAssertThrowsError(try PaymentQR.make(for: i))
        i = invoice(); i.constantSymbol = "12345"
        XCTAssertThrowsError(try PaymentQR.make(for: i))
    }

    func testLegacyDatabaseAndHolderSnapshot() throws {
        var db = Database()
        db.invoices = [invoice()]
        let data = try DatabaseFile.encode(db)
        let text = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(text.contains("holderName"))
        XCTAssertFalse(text.contains("paymentQRFormat"))
        let restored = try DatabaseFile.decode(data)
        XCTAssertEqual(try PaymentQR.make(for: restored.invoices[0])?.beneficiary, "Michal Prekop")
        db.settings.accounts = [try XCTUnwrap(invoice().account)]
        db.settings.accounts[0].holderName = "Meno majiteľa"
        let new = db.newInvoice()
        db.settings.accounts[0].holderName = "Zmenené meno"
        XCTAssertEqual(new.account?.holderName, "Meno majiteľa")
        db.invoices[0].paymentQRFormat = .qrPlatba
        db.invoices[0].account?.holderName = "Majiteľ"
        XCTAssertEqual(try DatabaseFile.decode(DatabaseFile.encode(db)), db)
    }
}
