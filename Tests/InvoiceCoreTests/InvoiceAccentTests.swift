import XCTest
@testable import InvoiceCore

final class InvoiceAccentTests: XCTestCase {
    func testHexParsingAndContrast() {
        XCTAssertEqual(InvoiceAccent(hex: "  #aBcDef\n")?.hex, "#ABCDEF")
        for invalid in ["", "#123", "#12345678", "GGGGGG", "-12345"] { XCTAssertNil(InvoiceAccent(hex: invalid)) }
        for hex in ["126657", "2463A8", "B83A32", "F5E663", "FFFFFF", "000000", "00FF00"] {
            let color = InvoiceAccent(hex: hex)!
            XCTAssertGreaterThanOrEqual(1.05 / (color.textOnWhite.luminance + 0.05), 4.5)
            let bandContrast = color.usesDarkBandText ? (color.luminance + 0.05) / 0.05 : 1.05 / (color.luminance + 0.05)
            XCTAssertGreaterThanOrEqual(bandContrast, 4.5)
        }
        XCTAssertTrue(InvoiceAccent(hex: "F5E663")!.usesDarkBandText)
        XCTAssertFalse(InvoiceAccent.standard.usesDarkBandText)
        XCTAssertEqual(InvoiceAccent.standard.textOnWhite, .standard)
    }

    func testSettingsBackwardCompatibilityAndColorRoundTrip() throws {
        var settings = Settings()
        settings.supplier.name = "Test"
        settings.invoiceAccentHex = "#2463A8"
        let data = try JSONEncoder().encode(settings)
        XCTAssertEqual(try JSONDecoder().decode(Settings.self, from: data).invoiceAccent.hex, "#2463A8")
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        legacy.removeValue(forKey: "invoiceAccentHex")
        let restored = try JSONDecoder().decode(Settings.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertEqual(restored.invoiceAccent, .standard)
        settings.invoiceAccentHex = "invalid"
        XCTAssertNotNil(settings.validationMessage)
        XCTAssertEqual(settings.invoiceAccent, .standard)
    }
}
