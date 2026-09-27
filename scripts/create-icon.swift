import AppKit
import CoreText

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let p = CGFloat(pixels)
        let bounds = NSRect(x: p * 0.07, y: p * 0.07, width: p * 0.86, height: p * 0.86)
        NSColor(calibratedRed: 0.07, green: 0.40, blue: 0.34, alpha: 1).setFill()
        NSBezierPath(roundedRect: bounds, xRadius: p * 0.19, yRadius: p * 0.19).fill()
        let title = NSAttributedString(string: "FA", attributes: [.font: NSFont.systemFont(ofSize: p * 0.53, weight: .black), .foregroundColor: NSColor.white, .kern: 0])
        let line = CTLineCreateWithAttributedString(title)
        let ink = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
        let context = NSGraphicsContext.current!.cgContext
        context.textPosition = CGPoint(x: (p - ink.width) / 2 - ink.minX, y: (p - ink.height) / 2 - ink.minY)
        CTLineDraw(line, context)
        NSGraphicsContext.restoreGraphicsState()
        let name = "icon_\(size)x\(size)" + (scale == 2 ? "@2x" : "") + ".png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
    }
}
