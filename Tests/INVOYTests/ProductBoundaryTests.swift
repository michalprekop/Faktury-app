import XCTest
import Foundation
@testable import INVOY

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
        for url in ["http://invoy.xyz", "https://invoy.xyz.attacker.test", "https://invoy.xyz:8443", "file:///tmp/invoice.html", "https://attacker.test"] {
            XCTAssertFalse(CloudEndpoint.trusted(URL(string:url)),url)
        }
    }
}
