import XCTest
import SwiftUI
import InvoiceCore
@testable import Faktury

final class InvoiceAutosaveTests: XCTestCase {
    private func folder() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    @MainActor func testSwitchingDraftsRetainsEditOrderAndDoesNotBlockQuit() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let older = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        let date = try XCTUnwrap(store.invoiceRecovery.first?.modifiedAt)
        XCTAssertTrue(older.flush())
        XCTAssertEqual(store.invoiceRecovery.first?.modifiedAt, date)
        older.stopAutosave()
        let newer = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        newer.invoice.note = "Latest active draft"
        XCTAssertTrue(store.flushInvoices())
        XCTAssertEqual(store.invoiceRecovery.max(by: { $0.modifiedAt < $1.modifiedAt })?.id, newer.invoice.id)
    }

    @MainActor func testEveryValidChangeIsCheckpointedImmediatelyAndCommittedAfterPause() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let source = try XCTUnwrap(store.invoices.first)
        let draft = InvoiceDraft(source, store: store)
        draft.invoice.note = "First"
        draft.invoice.note = "Latest note"
        draft.invoice.items[0].unitPrice = 950
        let recovered = Store(dataDirectory: directory)
        XCTAssertEqual(recovered.invoices.first?.note, "Latest note")
        XCTAssertEqual(recovered.database.invoices.first, source)
        try await Task.sleep(for: .milliseconds(650))
        XCTAssertEqual(draft.saveState, .saved)
        XCTAssertFalse(draft.hasChanges)
        let reopened = Store(dataDirectory: directory)
        XCTAssertEqual(reopened.database.invoices.first?.note, "Latest note")
        XCTAssertEqual(reopened.database.invoices.first?.total, 950)
        XCTAssertTrue(reopened.invoiceRecovery.isEmpty)
        XCTAssertEqual(reopened.database.settings, store.database.settings)
    }

    @MainActor func testIncompleteNewInvoicesRemainInListAndReserveTheirNumbers() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let first = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        first.invoice.items[0].name = "An unfinished item"
        XCTAssertTrue(first.flush())
        XCTAssertEqual(first.saveState, .recovered)
        let second = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        XCTAssertNotEqual(first.invoice.number, second.invoice.number)
        XCTAssertTrue(store.flushInvoices())
        let restored = Store(dataDirectory: directory)
        XCTAssertEqual(restored.invoices.count, 3)
        XCTAssertEqual(restored.database.invoices.count, 1)
        XCTAssertEqual(restored.invoiceRecovery.count, 2)
        XCTAssertEqual(restored.invoices.first { $0.id == first.invoice.id }?.items[0].name, "An unfinished item")
    }

    @MainActor func testRawInvalidNumberAndOtherEditsSurviveRestartWithoutDamagingValidInvoice() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let source = try XCTUnwrap(store.invoices.first)
        let draft = InvoiceDraft(source, store: store)
        let key = "p" + source.items[0].id.uuidString
        let price = Binding(get: { draft.invoice.items[0].unitPrice }, set: { draft.invoice.items[0].unitPrice = $0 })
        draft.setNumber("250,", key: key, value: price)
        draft.invoice.note = "Keep this together with the unfinished price"
        XCTAssertTrue(store.flushInvoices())
        XCTAssertEqual(draft.saveState, .recovered)
        XCTAssertFalse(draft.canExport)
        let reopened = Store(dataDirectory: directory)
        XCTAssertEqual(reopened.database.invoices.first, source)
        let resumed = InvoiceDraft(try XCTUnwrap(reopened.invoices.first), store: reopened)
        XCTAssertEqual(resumed.numericInputs[key], "250,")
        XCTAssertTrue(resumed.invalid.contains(key))
        XCTAssertEqual(resumed.invoice.note, draft.invoice.note)
        let resumedPrice = Binding(get: { resumed.invoice.items[0].unitPrice }, set: { resumed.invoice.items[0].unitPrice = $0 })
        resumed.setNumber("250,50", key: key, value: resumedPrice)
        XCTAssertTrue(resumed.flush())
        XCTAssertEqual(resumed.saveState, .saved)
        XCTAssertEqual(Store(dataDirectory: directory).database.invoices.first?.total, Decimal(string: "250.5"))
        draft.stopAutosave()
    }

    @MainActor func testFlushBeforeDebouncePreservesLastKeystrokeAndDoesNotDuplicate() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(try XCTUnwrap(store.invoices.first), store: store)
        draft.invoice.items[0].detail = "Last keystroke"
        XCTAssertTrue(store.flushInvoices())
        XCTAssertEqual(Store(dataDirectory: directory).invoices.first?.items[0].detail, "Last keystroke")
        try await Task.sleep(for: .milliseconds(650))
        XCTAssertEqual(store.invoices.count, 1)
        XCTAssertTrue(store.invoiceRecovery.isEmpty)
    }

    @MainActor func testRecoveryWriteFailureIsVisibleAndRetriedWithoutLosingInput() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(try XCTUnwrap(store.invoices.first), store: store)
        try FileManager.default.createDirectory(at: store.recoveryURL, withIntermediateDirectories: false)
        draft.invoice.note = "Retain this on failure"
        XCTAssertEqual(draft.saveState, .failed)
        XCTAssertFalse(store.flushInvoices())
        XCTAssertNotNil(draft.message)
        try FileManager.default.removeItem(at: store.recoveryURL)
        XCTAssertTrue(draft.flush())
        XCTAssertEqual(draft.saveState, .saved)
        XCTAssertEqual(Store(dataDirectory: directory).invoices.first?.note, "Retain this on failure")
    }

    @MainActor func testCanonicalWriteFailureStillLeavesRecoverableInput() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(try XCTUnwrap(store.invoices.first), store: store)
        let saved = directory.appendingPathComponent("saved.json")
        try FileManager.default.moveItem(at: store.url, to: saved)
        try FileManager.default.createDirectory(at: store.url, withIntermediateDirectories: false)
        draft.invoice.note = "Recoverable even when database write fails"
        XCTAssertFalse(draft.flush())
        XCTAssertEqual(draft.saveState, .failed)
        let records = try JSONDecoder().decode([InvoiceRecovery].self, from: Data(contentsOf: store.recoveryURL))
        XCTAssertEqual(records.first?.invoice.note, draft.invoice.note)
        try FileManager.default.removeItem(at: store.url)
        try FileManager.default.moveItem(at: saved, to: store.url)
        XCTAssertTrue(draft.flush())
    }

    @MainActor func testBackupIncludesUnfinishedInputAndRestoreCancelsOlderAutosave() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        draft.invoice.items[0].name = "Incomplete draft in backup"
        let backup = try DatabaseFile.decode(DatabaseFile.encode(store.backupDatabase()))
        XCTAssertEqual(backup.invoiceRecovery?.first?.invoice.id, draft.invoice.id)
        draft.invoice.items[0].name = "Must not replace restored input"
        XCTAssertTrue(store.restore(backup))
        try await Task.sleep(for: .milliseconds(650))
        let reopened = Store(dataDirectory: directory)
        XCTAssertEqual(reopened.invoiceRecovery.first?.invoice.items[0].name, "Incomplete draft in backup")
        XCTAssertNil(reopened.database.invoiceRecovery)
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.pendingRestoreURL.path))
    }

    @MainActor func testInterruptedRestoreIsCompletedOnLaunch() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        var backup = store.database
        let fresh = store.newInvoice()
        backup.invoiceRecovery = [InvoiceRecovery(invoice: fresh, numericInputs: ["paid": "-"])]
        try DatabaseFile.encode(backup).write(to: store.pendingRestoreURL)
        let reopened = Store(dataDirectory: directory)
        XCTAssertFalse(reopened.loadFailed)
        XCTAssertEqual(reopened.invoiceRecovery.first?.numericInputs["paid"], "-")
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.pendingRestoreURL.path))
    }

    @MainActor func testDeletedIncompleteDraftCannotBeResurrectedByPendingTask() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(store.newInvoice(), isNew: true, store: store)
        draft.invoice.note = "Delete this draft"
        XCTAssertTrue(store.deleteInvoice(draft.invoice.id))
        try await Task.sleep(for: .milliseconds(650))
        let reopened = Store(dataDirectory: directory)
        XCTAssertEqual(reopened.invoices.count, 1)
        XCTAssertTrue(reopened.invoiceRecovery.isEmpty)
    }

    @MainActor func testExternalAmountChangeReplacesRawFieldAndCorruptRecoveryIsNotOverwritten() async throws {
        let directory = folder()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory)
        let draft = InvoiceDraft(try XCTUnwrap(store.invoices.first), store: store)
        let paid = Binding(get: { draft.invoice.paid }, set: { draft.invoice.paid = $0 })
        draft.setNumber("0", key: "paid", value: paid)
        draft.invoice.paid = draft.invoice.total
        XCTAssertNil(draft.numericInputs["paid"])
        XCTAssertTrue(draft.flush())
        draft.stopAutosave()
        let corrupt = Data("broken recovery file".utf8)
        try corrupt.write(to: store.recoveryURL)
        let reopened = Store(dataDirectory: directory)
        let blocked = InvoiceDraft(try XCTUnwrap(reopened.invoices.first), store: reopened)
        blocked.invoice.note = "Do not overwrite corrupt recovery"
        XCTAssertFalse(blocked.flush())
        XCTAssertEqual(try Data(contentsOf: store.recoveryURL), corrupt)
    }
}
