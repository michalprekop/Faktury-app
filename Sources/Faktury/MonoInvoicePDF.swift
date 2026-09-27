import AppKit
import InvoiceCore

/// Independent layout keeps the original template unchanged.
enum MonoInvoicePDF {
    static func render(_ invoice: Invoice, pageCount: Int? = nil) -> Data {
        let output = NSMutableData()
        let pageWidth: CGFloat = 595.28, pageHeight: CGFloat = 841.89
        let left: CGFloat = 32, width: CGFloat = 531.28, bottom: CGFloat = 752
        let ink = NSColor(calibratedWhite: 0.08, alpha: 1)
        let muted = NSColor(calibratedWhite: 0.44, alpha: 1)
        var box = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        guard let consumer = CGDataConsumer(data: output as CFMutableData),
              let context = CGContext(consumer: consumer, mediaBox: &box,
                                      [kCGPDFContextTitle as String: "Faktúra \(invoice.number)",
                                       kCGPDFContextAuthor as String: invoice.supplier.name] as CFDictionary) else { return Data() }
        var y: CGFloat = 0, page = 0
        var qr: PaymentQRImage?
        var qrError = ""
        do {
            if let payment = try PaymentQR.make(for: invoice) { qr = try PaymentQRImage(payment: payment) }
        } catch { qrError = error.localizedDescription }

        func attributed(_ value: String, size: CGFloat, weight: NSFont.Weight = .regular,
                        color: NSColor? = nil, alignment: NSTextAlignment = .left) -> NSAttributedString {
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = alignment
            paragraph.lineSpacing = 2
            paragraph.lineBreakMode = .byWordWrapping
            return InvoiceTypography.attributed(value, size: size, weight: weight, monospaced: true,
                attributes: [.foregroundColor: color ?? ink, .paragraphStyle: paragraph])
        }
        func height(_ value: String, _ w: CGFloat, size: CGFloat = 8.5, weight: NSFont.Weight = .regular) -> CGFloat {
            guard !value.isEmpty else { return 0 }
            return ceil(attributed(value, size: size, weight: weight)
                .boundingRect(with: NSSize(width: w, height: 100000), options: [.usesLineFragmentOrigin, .usesFontLeading]).height)
        }
        @discardableResult func text(_ value: String, _ x: CGFloat, _ top: CGFloat, _ w: CGFloat,
                                    size: CGFloat = 8.5, weight: NSFont.Weight = .regular,
                                    color: NSColor? = nil, alignment: NSTextAlignment = .left) -> CGFloat {
            let h = height(value, w, size: size, weight: weight)
            attributed(value, size: size, weight: weight, color: color, alignment: alignment)
                .draw(with: NSRect(x: x, y: top, width: w, height: h + 2), options: [.usesLineFragmentOrigin, .usesFontLeading])
            return h
        }
        func rule(_ top: CGFloat, heavy: Bool = false) {
            if heavy {
                ink.setFill()
                NSRect(x: left, y: top, width: width, height: 8).fill()
            } else {
                context.saveGState()
                context.setStrokeColor(NSColor.black.cgColor)
                context.setLineWidth(0.5)
                context.setLineDash(phase: 0, lengths: [3, 2])
                context.move(to: CGPoint(x: left, y: top + 0.25))
                context.addLine(to: CGPoint(x: left + width, y: top + 0.25))
                context.strokePath()
                context.restoreGState()
            }
        }
        func picture(_ data: Data?, _ rect: NSRect) {
            guard let data, let image = NSImage(data: data), image.size.width > 0, image.size.height > 0 else { return }
            let scale = min(rect.width / image.size.width, rect.height / image.size.height)
            let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: NSRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2,
                                 width: size.width, height: size.height), from: .zero, operation: .sourceOver,
                       fraction: 1, respectFlipped: true, hints: nil)
        }
        func beginPage() {
            page += 1
            context.beginPDFPage(nil)
            context.saveGState()
            context.translateBy(x: 0, y: pageHeight); context.scaleBy(x: 1, y: -1)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
            NSColor.white.setFill(); box.fill()
            y = 32
        }
        func endPage() {
            rule(774)
            let contacts = [invoice.issuedBy.isEmpty ? "" : "Vystavil: \(invoice.issuedBy)",
                            invoice.supplier.website, invoice.supplier.email, invoice.supplier.phone].filter { !$0.isEmpty }
            for (index, value) in contacts.enumerated() {
                text(value, left + CGFloat(index % 2) * 278, 784 + CGFloat(index / 2) * 17, 253, size: 6.5, color: muted)
            }
            text("\(page)/\(pageCount ?? 1)", left + width - 40, 825, 40, size: 6.5, color: muted, alignment: .right)
            NSGraphicsContext.restoreGraphicsState(); context.restoreGState(); context.endPDFPage()
        }
        func continued() {
            endPage(); beginPage()
            y += text("FAKTÚRA / \(invoice.number)", left, y, width, size: 14, weight: .bold) + 18
        }
        func ensure(_ h: CGFloat) { if y + h > bottom { continued() } }
        func tableHeader() {
            rule(y, heavy: true); y += 17
            text("POLOŽKA", left, y, 240, size: 7, color: muted)
            text("MNOŽSTVO", 290, y, 62, size: 7, color: muted, alignment: .right)
            text("CENA / MJ", 361, y, 92, size: 7, color: muted, alignment: .right)
            text(invoice.supplier.vatPayer ? "SPOLU S DPH" : "SPOLU", 462, y, 101, size: 7, color: muted, alignment: .right)
            y += 18; rule(y)
        }
        func company(_ title: String, _ company: Company, x: CGFloat, top: CGFloat) -> CGFloat {
            let w: CGFloat = 253
            var cursor = top
            cursor += text(title, x, cursor, w, size: 7.5, color: muted) + 7
            cursor += text(company.name, x, cursor, w, size: 10, weight: .bold) + 6
            cursor += text(company.address, x, cursor, w) + 7
            let ids = [("IČO", company.companyID), ("DIČ", company.taxID), ("IČ DPH", company.vatID)]
            for (label, value) in ids where !value.isEmpty {
                cursor += text(label + ": " + value, x, cursor, w, size: 8) + 2
            }
            return cursor
        }
        func detailRows(_ rows: [(String, String)], x: CGFloat, top: CGFloat) -> CGFloat {
            var cursor = top
            for (label, value) in rows where !value.isEmpty {
                let labelHeight = text(label, x, cursor, 96, size: 7.5, color: muted)
                let valueHeight = text(value, x + 102, cursor, 151, size: 8)
                cursor += max(labelHeight, valueHeight) + 5
            }
            return cursor
        }
        // Preserve paragraph breaks and split even an unbroken long word across pages.
        func chunks(_ value: String, w: CGFloat, maxHeight: CGFloat, size: CGFloat = 8.5) -> [String] {
            var result: [String] = [], chunk = ""
            for paragraph in value.components(separatedBy: "\n") {
                if !chunk.isEmpty { chunk += "\n" }
                for word in paragraph.components(separatedBy: " ") {
                    let separator = chunk.isEmpty || chunk.hasSuffix("\n") ? "" : " "
                    if height(chunk + separator + word, w, size: size) <= maxHeight { chunk += separator + word; continue }
                    if !chunk.isEmpty { result.append(chunk); chunk = "" }
                    for character in word {
                        if height(chunk + String(character), w, size: size) > maxHeight, !chunk.isEmpty {
                            result.append(chunk); chunk = ""
                        }
                        chunk.append(character)
                    }
                }
            }
            if !chunk.isEmpty { result.append(chunk) }
            return result.isEmpty ? [""] : result
        }

        beginPage()
        let compact = invoice.items.count > 1
        let logoTop: CGFloat = compact ? 22 : 32
        let logoSize = MonoInvoiceBrand.wordmark?.size ?? NSSize(width: 1559, height: 158)
        let logoHeight = width * logoSize.height / logoSize.width
        picture(MonoInvoiceBrand.wordmarkData, NSRect(x: left, y: logoTop, width: width, height: logoHeight))
        let metadataTop = logoTop + logoHeight + (compact ? 14 : 30)
        text("Číslo faktúry", left, metadataTop, 245, size: 7.5, color: muted)
        let numberHeight = text(invoice.number, left, metadataTop + 14, 245, size: 12, weight: .bold)
        text("FAKTÚRA", 310, metadataTop + 16, 253, size: 10, weight: .semibold, alignment: .right)
        y = metadataTop + max(45, 23 + numberHeight)
        rule(y, heavy: true); y += 21
        y = max(company("DODÁVATEĽ", invoice.supplier, x: left, top: y),
                company("ODBERATEĽ", invoice.customer, x: 310, top: y)) + 10
        if !invoice.supplier.registration.isEmpty {
            y += text(invoice.supplier.registration, left, y, width, size: 7, color: muted) + 12
        }
        let bank = [("Banka", invoice.account?.name ?? ""),
                    ("IBAN", invoice.account.map { Format.iban($0.iban) } ?? ""),
                    ("SWIFT", invoice.account?.swift ?? ""),
                    ("Variabilný symbol", invoice.variableSymbol),
                    ("Konštantný symbol", invoice.constantSymbol),
                    ("Špecifický symbol", invoice.specificSymbol)]
        let dates = [("Dátum vystavenia", Format.date(invoice.issueDate)),
                     ("Dátum splatnosti", Format.date(invoice.dueDate)),
                     ("Dátum dodania", invoice.deliveryDate.map(Format.date) ?? ""),
                     ("Forma úhrady", invoice.paymentMethod), ("Objednávka", invoice.orderNumber)]
        y = max(detailRows(bank, x: left, top: y), detailRows(dates, x: 310, top: y)) + 17
        ensure(75); tableHeader()
        for item in invoice.items {
            let description = [item.name, item.detail, item.discount > 0 ? "Zľava \(Format.number(item.discount)) %" : "",
                               invoice.supplier.vatPayer ? "DPH \(Format.number(item.vatRate)) %" : ""].filter { !$0.isEmpty }.joined(separator: "\n")
            let source = description as NSString
            let detailRange = NSRange(location: item.name.isEmpty ? 0 : (item.name as NSString).length + 1,
                                      length: (item.detail as NSString).length)
            var sourceOffset = 0
            let values = ["\(Format.number(item.quantity)) \(item.unit)", Format.money(item.unitPrice, currency: invoice.currency),
                          Format.money(item.total(vatEnabled: invoice.supplier.vatPayer), currency: invoice.currency)]
            for (index, chunk) in chunks(description, w: 246, maxHeight: 270).enumerated() {
                let valueHeight = index == 0 ? zip(values, [CGFloat(62), 92, 101]).map { height($0.0, $0.1) }.max() ?? 0 : 0
                let rowHeight = max(32, max(height(chunk, 246), valueHeight) + 18)
                if y + rowHeight > bottom { continued(); tableHeader() }
                // Locate each page fragment in order so only the item's detail stays muted,
                // including continuations and descriptions repeating the item's name.
                let fragmentRange = source.range(of: chunk, range: NSRange(location: sourceOffset, length: source.length - sourceOffset))
                let styled = NSMutableAttributedString(attributedString: attributed(chunk, size: 8.5))
                if fragmentRange.location != NSNotFound {
                    let detail = NSIntersectionRange(fragmentRange, detailRange)
                    if detail.length > 0 {
                        styled.addAttribute(.foregroundColor, value: muted,
                                            range: NSRange(location: detail.location - fragmentRange.location, length: detail.length))
                    }
                    sourceOffset = NSMaxRange(fragmentRange)
                }
                styled.draw(with: NSRect(x: left, y: y + 9, width: 246, height: height(chunk, 246) + 2),
                            options: [.usesLineFragmentOrigin, .usesFontLeading])
                if index == 0 {
                    text(values[0], 290, y + 9, 62, alignment: .right)
                    text(values[1], 361, y + 9, 92, alignment: .right)
                    text(values[2], 462, y + 9, 101, weight: .medium, alignment: .right)
                }
                y += rowHeight; rule(y)
            }
        }
        y += 8
        var totals: [(String, Decimal, Bool)] = []
        if invoice.supplier.vatPayer {
            totals.append(("Základ dane", invoice.net, false))
            for rate in Set(invoice.items.map(\.vatRate)).sorted() {
                totals.append(("DPH \(Format.number(rate)) %", invoice.items.filter { $0.vatRate == rate }.reduce(0) { $0 + $1.vat(enabled: true) }, false))
            }
        }
        totals += [("Celková suma", invoice.total, false), ("Uhradené", invoice.paid, false), ("Suma na úhradu", invoice.remaining, true)]
        if invoice.overpayment > 0 { totals.append(("Preplatok", invoice.overpayment, false)) }
        let note = [invoice.note.isEmpty ? "" : "Poznámka: \(invoice.note)", qrError].filter { !$0.isEmpty }.joined(separator: "\n")
        let closingHeight = max(qr == nil ? 0 : PaymentQRImage.blockHeight, invoice.signature == nil ? 0 : 85)
        let noteHeight = height(note, width, size: 8)
        let summaryHeight = totals.reduce(CGFloat.zero) { result, row in
            result + max(25, height(Format.money(row.1, currency: invoice.currency), 193,
                                    size: row.2 ? 12 : 9, weight: row.2 ? .bold : .regular) + 12)
        }
        // Keep a short closing section together instead of exporting a page containing only a QR/signature.
        let closingBlock = summaryHeight + 15 + (note.isEmpty ? 0 : noteHeight + 12) + closingHeight
        ensure(noteHeight < 120 && closingBlock < 650 ? closingBlock : min(summaryHeight, 400))
        for (label, amount, strong) in totals {
            ensure(max(25, height(Format.money(amount, currency: invoice.currency), 193,
                                  size: strong ? 12 : 9, weight: strong ? .bold : .regular) + 12))
            text(label, left, y + 6, 320, size: 9, weight: strong ? .bold : .regular)
            let h = text(Format.money(amount, currency: invoice.currency), 370, y + 6, 193, size: strong ? 12 : 9,
                         weight: strong ? .bold : .regular, alignment: .right)
            y += max(25, h + 12); rule(y)
        }
        y += 15
        for chunk in chunks(note, w: width, maxHeight: 250, size: 8) where !chunk.isEmpty {
            let h = height(chunk, width, size: 8)
            ensure(h + 12)
            y += text(chunk, left, y, width, size: 8, color: muted) + 12
        }
        if closingHeight > 0 {
            ensure(closingHeight)
            if let qr {
                qr.draw(at: NSPoint(x: left, y: y))
                text(qr.payment.label, left, y + PaymentQRImage.side + 2, PaymentQRImage.side,
                     size: 7, weight: .medium, alignment: .center)
            }
            if invoice.signature != nil {
                text("Podpis a pečiatka", 363, y + 5, 200, size: 7, color: muted, alignment: .right)
                picture(invoice.signature, NSRect(x: 393, y: y + 20, width: 170, height: 62))
            }
        }
        endPage(); context.closePDF()
        return pageCount == nil ? render(invoice, pageCount: page) : output as Data
    }
}
