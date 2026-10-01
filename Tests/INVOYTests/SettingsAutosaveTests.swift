import XCTest
import InvoiceCore
@testable import INVOY

final class SettingsAutosaveTests: XCTestCase {
    private func folder() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    @MainActor func testAutosavePersistsLatestDraftWithoutChangingInvoices() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let invoices = store.database.invoices
        var settings = store.database.settings
        settings.issuedBy = "First draft"
        store.queueSettingsSave(settings)
        settings.issuedBy = "Final draft"
        settings.defaultAccountID = settings.accounts.last?.id
        store.queueSettingsSave(settings)
        try await Task.sleep(for: .milliseconds(700))
        let restored = Store(dataDirectory: directory, initialDatabase: Store.seed())
        XCTAssertEqual(restored.database.settings, settings)
        XCTAssertEqual(restored.database.invoices, invoices)
        XCTAssertNil(store.pendingSettings)
        XCTAssertNil(store.settingsSaveMessage)
    }

    @MainActor func testFlushSavesBeforeCreatingInvoiceOrLeavingSettings() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        var settings = store.database.settings
        settings.defaultNote = "Updated note"
        store.queueSettingsSave(settings)
        XCTAssertEqual(store.newInvoice().note, "Updated note")
        settings.dueDays = 30
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.flushSettings())
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database.settings, settings)
    }

    @MainActor func testInvalidInputPreservesSavedSettingsAndCanBeCorrected() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let original = store.database.settings
        var settings = original
        settings.supplier.name = ""
        store.queueSettingsSave(settings)
        XCTAssertFalse(store.flushSettings())
        XCTAssertNotNil(store.settingsSaveMessage)
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database.settings, original)
        settings = original
        settings.defaultVAT = 101
        store.queueSettingsSave(settings)
        XCTAssertFalse(store.flushSettings())
        settings = original
        settings.accounts[0].iban = "INVALID"
        store.queueSettingsSave(settings)
        XCTAssertFalse(store.flushSettings())
        settings = original
        settings.issuedBy = "Corrected"
        store.queueSettingsSave(settings, hasInvalidInput: true)
        XCTAssertFalse(store.flushSettings())
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.flushSettings())
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database.settings, settings)
    }

    @MainActor func testRestoreCancelsPendingAutosave() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let backup = store.database
        var settings = backup.settings
        settings.issuedBy = "Must not overwrite restored backup"
        store.queueSettingsSave(settings)
        XCTAssertTrue(store.restore(backup))
        try await Task.sleep(for: .milliseconds(700))
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database, backup)
        XCTAssertNil(store.pendingSettings)
    }

    @MainActor func testWriteFailureKeepsDraftForRetry() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let original = store.database.settings
        var settings = original
        settings.issuedBy = "Retry this change"
        store.queueSettingsSave(settings)
        let savedURL = directory.appendingPathComponent("saved.json")
        try FileManager.default.moveItem(at: store.url, to: savedURL)
        try FileManager.default.createDirectory(at: store.url, withIntermediateDirectories: false)
        XCTAssertFalse(store.flushSettings())
        XCTAssertEqual(store.database.settings, original)
        XCTAssertEqual(store.pendingSettings, settings)
        XCTAssertNotNil(store.settingsSaveMessage)
        try FileManager.default.removeItem(at: store.url)
        try FileManager.default.moveItem(at: savedURL, to: store.url)
        XCTAssertTrue(store.flushSettings())
        XCTAssertEqual(Store(dataDirectory: directory, initialDatabase: Store.seed()).database.settings, settings)
    }
}
