import XCTest
import Foundation
import InvoiceCore
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
    @MainActor func testAccountSwitchKeepsLogoSignatureAndSyncStateInTheirOwnCache() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let firstID = UUID().uuidString, secondID = UUID().uuidString
        // Even a populated legacy database must not seed a cloud account.
        let legacy = Store(dataDirectory: root, initialDatabase: Store.seed())
        XCTAssertNotNil(legacy.database.settings.signature)
        var active = try NativeCloudSync.openAccountCache(userID: firstID, root: root)
        XCTAssertNil(active.store.database.settings.signature)
        let logo = Data("first-account-logo".utf8), signature = Data("first-account-signature".utf8)
        XCTAssertTrue(active.store.update {
            $0.settings.logo = logo
            $0.settings.signature = signature
        })
        let firstDatabase = active.store.database
        let stateURL = active.store.url.deletingLastPathComponent().appendingPathComponent("cloud-sync.json")
        try JSONEncoder().encode(NativeCloudSync.State(database: firstDatabase, profileVersion: 4, versions: [:]))
            .write(to: stateURL)

        active = try NativeCloudSync.openAccountCache(userID: firstID, root: root)
        XCTAssertEqual(active.state?.profileVersion, 4)
        active = try NativeCloudSync.openAccountCache(userID: secondID, root: root)
        XCTAssertNil(active.state)
        XCTAssertNil(active.store.database.settings.logo)
        XCTAssertNil(active.store.database.settings.signature)
        XCTAssertNil(active.store.newInvoice().logo)
        XCTAssertNil(active.store.newInvoice().signature)
        XCTAssertTrue(active.store.update { $0.settings.logo = Data("second-account-logo".utf8) })

        active = try NativeCloudSync.openAccountCache(userID: firstID, root: root)
        XCTAssertEqual(active.store.database, firstDatabase)
        XCTAssertEqual(active.state?.database.settings.signature, signature)
        XCTAssertEqual(active.store.newInvoice().logo, logo)
        XCTAssertEqual(active.store.newInvoice().signature, signature)
    }
    func testNativeBridgeRejectsLookalikeAndInsecureOrigins() {
        XCTAssertTrue(CloudEndpoint.trusted(CloudEndpoint.origin.appendingPathComponent("api/export")))
        for url in ["http://invoy.xyz", "https://invoy.xyz.attacker.test", "https://invoy.xyz:8443", "file:///tmp/invoice.html", "https://attacker.test"] {
            XCTAssertFalse(CloudEndpoint.trusted(URL(string:url)),url)
        }
    }
}
