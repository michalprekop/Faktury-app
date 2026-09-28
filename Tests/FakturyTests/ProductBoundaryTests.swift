import XCTest
import Foundation
@testable import Faktury

final class ProductBoundaryTests: XCTestCase {
    @MainActor func testNewInstallationHasNoPreviousOwnerData() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store=Store(dataDirectory: directory)
        XCTAssertTrue(store.database.invoices.isEmpty)
        XCTAssertTrue(store.database.settings.supplier.name.isEmpty)
        XCTAssertTrue(store.database.settings.accounts.isEmpty)
        XCTAssertNil(store.database.settings.signature)
        XCTAssertNil(store.database.settings.logo)
    }
    func testNativeBridgeRejectsLookalikeAndInsecureOrigins() {
        XCTAssertTrue(CloudEndpoint.trusted(CloudEndpoint.origin.appendingPathComponent("api/export")))
        for url in ["http://faktury-app.freetransfer-online.workers.dev", "https://faktury-app.freetransfer-online.workers.dev.attacker.test", "https://faktury-app.freetransfer-online.workers.dev:8443", "file:///tmp/invoice.html", "https://attacker.test"] {
            XCTAssertFalse(CloudEndpoint.trusted(URL(string:url)),url)
        }
    }
}
