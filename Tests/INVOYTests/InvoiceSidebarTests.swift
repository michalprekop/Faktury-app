import XCTest
import AppKit
import SwiftUI
import InvoiceCore
@testable import INVOY

final class InvoiceSidebarTests: XCTestCase {
    @MainActor func testSelectingVisibleInvoicesKeepsSidebarScrollPosition() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = Store(dataDirectory: directory, initialDatabase: Store.seed())
        let source = try XCTUnwrap(store.database.invoices.first)
        XCTAssertTrue(store.update { database in
            database.invoices = (1...30).map { index in
                var invoice = source
                invoice.id = UUID()
                invoice.number = String(2026000 + index)
                invoice.customer.name = index.isMultiple(of: 2) ? "Krátky názov" : "Odberateľ s dlhým obchodným menom na dva riadky"
                return invoice
            }
        })
        let suite = "InvoiceSidebarTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        var selectedID: UUID?
        let host = NSHostingView(rootView: InvoicesView(selectedID: Binding(get: { selectedID }, set: { selectedID = $0 }))
            .environmentObject(store).defaultAppStorage(defaults))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1185, height: 900),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil }

        func tables(in view: NSView) -> [NSTableView] {
            (view as? NSTableView).map { [$0] } ?? view.subviews.flatMap { tables(in: $0) }
        }
        func settle() async throws {
            host.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(180))
            host.layoutSubtreeIfNeeded()
        }
        try await settle()
        let table = try XCTUnwrap(tables(in: host).first)
        XCTAssertEqual(table.numberOfRows, 30)
        XCTAssertEqual(table.rect(ofRow: 0).height, InvoiceRow.height, accuracy: 0.5)
        let scroll = try XCTUnwrap(table.enclosingScrollView)
        scroll.contentView.scroll(to: NSPoint(x: 0, y: 900))
        scroll.reflectScrolledClipView(scroll.contentView)
        try await settle()
        let position = scroll.contentView.bounds.origin
        let contentHeight = table.frame.height
        let visible = table.rows(in: scroll.documentVisibleRect)
        let row = visible.location + 2
        XCTAssertLessThan(row + 1, NSMaxRange(visible))
        for index in [row, row + 1, row - 1, row] {
            table.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false)
            try await settle()
            XCTAssertEqual(selectedID, store.invoices.sorted { $0.number > $1.number }[index].id)
            XCTAssertEqual(scroll.contentView.bounds.origin.y, position.y, accuracy: 0.5)
            XCTAssertEqual(table.frame.height, contentHeight, accuracy: 0.5)
        }
        var pending = try XCTUnwrap(store.invoices.first { $0.id == selectedID })
        pending.customer.name = "Zmenený odberateľ s ešte dlhším názvom spoločnosti"
        XCTAssertTrue(store.checkpoint(InvoiceRecovery(invoice: pending, numericInputs: ["paid": "250,"])))
        try await settle()
        XCTAssertEqual(scroll.contentView.bounds.origin.y, position.y, accuracy: 0.5)
        XCTAssertTrue(store.clearRecovery(pending.id))
        try await settle()
        XCTAssertEqual(scroll.contentView.bounds.origin.y, position.y, accuracy: 0.5)
    }

    @MainActor func testRecoveryIndicatorDoesNotChangeRowHeight() {
        let invoice = Store.seed().invoices[0]
        for width: CGFloat in [225, 305] {
            let host = NSHostingView(rootView: InvoiceRow(invoice: invoice).frame(width: width))
            XCTAssertEqual(host.fittingSize.height, InvoiceRow.height, accuracy: 0.5)
            host.rootView = InvoiceRow(invoice: invoice, recovering: true).frame(width: width)
            XCTAssertEqual(host.fittingSize.height, InvoiceRow.height, accuracy: 0.5)
        }
    }
}
