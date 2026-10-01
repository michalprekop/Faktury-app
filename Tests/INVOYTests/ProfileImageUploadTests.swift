import XCTest
import InvoiceCore
@testable import INVOY

final class ProfileImageUploadTests: XCTestCase {
    private func png(size: Int) -> Data {
        var data = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=")!
        data.append(Data(repeating: 0, count: size - data.count))
        return data
    }

    func testPNGAtHalfMegabyteIsAcceptedAndOversizedOrInvalidImagesAreRejected() {
        XCTAssertNoThrow(try ProfileImageUpload.validate(png(size: 500_000)))
        XCTAssertThrowsError(try ProfileImageUpload.validate(png(size: 500_001)))
        XCTAssertThrowsError(try ProfileImageUpload.validate(Data("not an image".utf8)))
    }

    @MainActor func testLargeLogoAndSignaturePersistWithoutChangingExistingInvoices() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let priorInvoices = store.database.invoices
        let image = png(size: 500_000)
        var settings = store.database.settings
        settings.logo = image
        settings.signature = image
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.flushSettings())
        let restored = Store(dataDirectory: directory)
        XCTAssertEqual(restored.database.settings.logo, image)
        XCTAssertEqual(restored.database.settings.signature, image)
        XCTAssertEqual(restored.database.invoices, priorInvoices)
        XCTAssertEqual(restored.newInvoice().logo, image)
        XCTAssertEqual(restored.newInvoice().signature, image)
    }
}
