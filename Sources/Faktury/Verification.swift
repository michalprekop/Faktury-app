import Foundation
import AppKit
import PDFKit
import InvoiceCore
import Vision

enum Verification {
    @MainActor static func renderDatabase(path: String, directory: String, expectSinglePage: Bool) {
        do {
            let db = try DatabaseFile.decode(Data(contentsOf: URL(fileURLWithPath: path)))
            let destination = URL(fileURLWithPath: directory)
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            var counts: [String: Int] = [:]
            var qrRecords: [[String: String]] = []
            for invoice in db.invoices.sorted(by: { $0.number < $1.number }) {
                let data = InvoicePDF.render(invoice, accentColor: db.settings.invoiceAccent, defaultTemplate: db.settings.defaultInvoiceTemplate)
                guard let document = PDFDocument(data: data) else { fatalError("Invalid PDF: \(invoice.number)") }
                counts[invoice.number] = document.pageCount
                let content = document.string ?? ""
                for value in [invoice.number, invoice.customer.name, "Suma na úhradu", "IBAN"] {
                    precondition(content.contains(value), "Missing \(value) in \(invoice.number)")
                }
                let expectedQR = try PaymentQR.make(for: invoice)
                let scanned = try scanQR(document)
                precondition(scanned == expectedQR.map { [$0.payload] } ?? [], "Rendered QR mismatch in \(invoice.number)")
                if let qr = expectedQR {
                    qrRecords.append(["number": invoice.number, "payload": scanned[0], "beneficiary": qr.beneficiary,
                                      "iban": invoice.account!.iban.filter { !$0.isWhitespace }.uppercased(),
                                      "bic": invoice.account!.swift, "vs": invoice.variableSymbol,
                                      "currency": invoice.currency, "amount": NSDecimalNumber(decimal: invoice.remaining).stringValue])
                }
                let filename = invoice.number.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
                try data.write(to: destination.appendingPathComponent("Faktura-\(String(filename)).pdf"), options: .atomic)
                print("\(invoice.number): \(document.pageCount) page(s)")
            }
            try JSONSerialization.data(withJSONObject: counts, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("page-counts.json"), options: .atomic)
            try JSONSerialization.data(withJSONObject: qrRecords, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("qr-codes.json"), options: .atomic)
            if expectSinglePage { precondition(counts.values.allSatisfy { $0 == 1 }, "Short invoice unexpectedly spans multiple pages") }
            print("Verified \(counts.count) PDFs; total pages: \(counts.values.reduce(0, +)); scanned QR codes: \(qrRecords.count)")
        } catch { fatalError("Database PDF verification failed: \(error)") }
    }

    @MainActor static func run(directory: String) {
        let destination = URL(fileURLWithPath: directory)
        do {
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let db = Store.seed()
            try db.validateStructure()
            let invoice = db.invoices[0]
            let single = InvoicePDF.render(invoice)
            guard let doc = PDFDocument(data: single), doc.pageCount == 1 else { fatalError("Single page PDF invalid") }
            let content = doc.string ?? ""
            for expected in ["2026025", "Ukážkový klient", "800,00", "TATRSKBX", "1234567890", "Podpis"] {
                precondition(content.contains(expected), "Missing PDF text: \(expected)")
            }
            precondition(!content.contains("TRWIBEB1XXX"), "Only one bank account belongs on an invoice")
            try single.write(to: destination.appendingPathComponent("Faktura-2026025.pdf"))
            var withDelivery = invoice
            withDelivery.deliveryDate = withDelivery.issueDate
            withDelivery.items[0].name = "Spravovanie webstránky Beansmiths.com, August 2026"
            withDelivery.items[0].unitPrice = 995
            withDelivery.paid = 995
            let deliveryPDF = PDFDocument(data: InvoicePDF.render(withDelivery))!
            precondition(deliveryPDF.pageCount == 1, "Delivery date must not push the payment band to a second page")
            precondition(deliveryPDF.page(at: 0)!.string!.contains("IBAN"))
            var threeItems = invoice
            threeItems.items = [
                "Predĺženie registrácie domény rival.sk na obdobie 04.06.2026 - 03.06.2027",
                "Webhosting ku webstránke agentura.rival.sk na obdobie 04.06.2026 - 03.06.2027",
                "Webstránka: poplatok za prevádzku zastaralej PHP verzie agentura.rival.sk, na obdobie 04.06.2026 - 03.06.2027"
            ].map { name in
                var item = InvoiceItem()
                item.name = name
                item.unitPrice = 20
                return item
            }
            threeItems.paid = threeItems.total
            let threeItemPDF = PDFDocument(data: InvoicePDF.render(threeItems))!
            precondition(threeItemPDF.pageCount == 1, "Three ordinary items must fit with totals, signature and payment band")
            precondition(threeItemPDF.page(at: 0)!.string!.contains("IBAN"))
            threeItems.paid = 0
            for format in [PaymentQRFormat.payBySquare, .qrPlatba] {
                threeItems.paymentQRFormat = format
                let payment = try PaymentQR.make(for: threeItems)!
                let data = InvoicePDF.render(threeItems)
                let document = PDFDocument(data: data)!
                precondition(document.pageCount == 1, "Three items plus payment QR must fit on one page")
                let scanned = try scanQR(document)
                precondition(scanned == [payment.payload], "QR must be readable from PDF")
                try data.write(to: destination.appendingPathComponent("Test-QR-\(format.rawValue).pdf"))
            }
            for hex in ["2463A8", "B83A32", "F5E663"] {
                let data = InvoicePDF.render(threeItems, accentColor: InvoiceAccent(hex: hex)!)
                let document = PDFDocument(data: data)!
                precondition(document.pageCount == 1)
                let scanned = try scanQR(document)
                let expected = try PaymentQR.make(for: threeItems)!.payload
                precondition(scanned == [expected])
                try data.write(to: destination.appendingPathComponent("Test-farba-\(hex).pdf"))
            }
            var long = invoice
            long.number = "TEST-VIAC-STRAN"
            long.supplier.vatPayer = true
            long.paid = 0
            long.items = (1...65).map { index in
                var item = InvoiceItem()
                item.name = "Položka \(index): Grafické práce a príprava propagačných materiálov"
                item.detail = "Rozšírený popis položky, kontrola diakritiky: ľščťžýáíéôäň."
                item.quantity = Decimal(string: "2.5")!
                item.unitPrice = Decimal(string: "99.99")!
                item.discount = 10
                item.vatRate = index % 2 == 0 ? 23 : 5
                return item
            }
            long.note = String(repeating: "Doplňujúca poznámka s diakritikou a podmienkami dodania. ", count: 80)
            let longData = InvoicePDF.render(long)
            guard let longDoc = PDFDocument(data: longData), longDoc.pageCount > 3 else { fatalError("Pagination invalid") }
            precondition((longDoc.string ?? "").contains("Položka 65"))
            precondition((longDoc.string ?? "").contains("Suma na úhradu"))
            try longData.write(to: destination.appendingPathComponent("Test-viac-stran.pdf"))
            for (name, sample) in [("jedna-polozka", invoice), ("tri-polozky-QR", threeItems), ("viac-stran", long)] {
                var mono = sample
                mono.templateOverride = .mono01
                if name == "jedna-polozka" { mono.paid = 0 }
                let data = InvoicePDF.render(mono)
                let document = PDFDocument(data: data)!
                precondition((document.string ?? "").contains("Suma na úhradu"))
                let expected = try PaymentQR.make(for: mono)
                let scanned = try scanQR(document)
                precondition(scanned == expected.map { [$0.payload] } ?? [])
                try data.write(to: destination.appendingPathComponent("Mono-01-\(name).pdf"))
            }
            let databaseURL = destination.appendingPathComponent("test-database.json")
            try DatabaseFile.save(db, to: databaseURL)
            let read = try DatabaseFile.decode(Data(contentsOf: databaseURL))
            precondition(read == db)
            print("PASS: reference PDF, single bank, SK/CZ QR scan, \(longDoc.pageCount)-page PDF, diacritics, totals, database round trip")
        } catch { fatalError("Verification failed: \(error)") }
    }

    static func scanQR(_ document: PDFDocument) throws -> [String] {
        var codes: [String] = []
        for index in 0..<document.pageCount {
            let page = document.page(at: index)!
            let image = page.thumbnail(of: NSSize(width: 1191, height: 1684), for: .mediaBox)
            guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("PDF rendering failed") }
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.qr]
            try VNImageRequestHandler(cgImage: cg).perform([request])
            codes += (request.results ?? []).compactMap(\.payloadStringValue)
        }
        return codes
    }
}
