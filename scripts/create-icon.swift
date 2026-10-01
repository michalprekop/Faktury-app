import AppKit

// Render the approved vector, including its final dot. Never re-typeset the logo.
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let source = URL(fileURLWithPath: "web/public/brand/invoy-icon-yellow.svg")
guard let artwork = NSImage(contentsOf: source) else { fatalError("Missing approved INVOY icon") }
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func png(pixels: Int, inset: CGFloat) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSGraphicsContext.current?.imageInterpolation = .high
    let p = CGFloat(pixels)
    artwork.draw(in: NSRect(x: p * inset, y: p * inset, width: p * (1 - 2 * inset), height: p * (1 - 2 * inset)))
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = "icon_\(size)x\(size)" + (scale == 2 ? "@2x" : "") + ".png"
        try png(pixels: size * scale, inset: 0.07).write(to: output.appendingPathComponent(name))
    }
}
if CommandLine.arguments.count > 2 {
    try png(pixels: 512, inset: 0).write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
}
