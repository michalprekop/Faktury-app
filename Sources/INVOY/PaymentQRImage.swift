import AppKit
import CoreImage.CIFilterBuiltins
import InvoiceCore

struct PaymentQRImage {
    let payment: PaymentQR
    let image: NSImage
    static let side: CGFloat = 112
    static let blockHeight: CGFloat = 127
    private static let context = CIContext()

    init(payment: PaymentQR) throws {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payment.payload.utf8)
        filter.correctionLevel = payment.format == .qrPlatba ? "M" : "L"
        guard let output = filter.outputImage else { throw DataError.invalid("QR kód sa nepodarilo vykresliť.") }
        // Four extra white modules provide a quiet zone. Integer scaling keeps edges crisp.
        let bounds = output.extent.insetBy(dx: -4, dy: -4)
        let white = CIImage(color: CIColor.white).cropped(to: bounds)
        let padded = output.composited(over: white).transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = Self.context.createCGImage(padded, from: padded.extent) else { throw DataError.invalid("QR kód sa nepodarilo vykresliť.") }
        self.image = NSImage(cgImage: cg, size: NSSize(width: Self.side, height: Self.side))
        self.payment = payment
    }

    func draw(at point: NSPoint) {
        let previous = NSGraphicsContext.current?.imageInterpolation
        NSGraphicsContext.current?.imageInterpolation = .none
        image.draw(in: NSRect(origin: point, size: NSSize(width: Self.side, height: Self.side)), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        if let previous { NSGraphicsContext.current?.imageInterpolation = previous }
    }
}
