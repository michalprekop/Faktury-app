import AppKit
import SwiftUI

struct DismissEditingOnOutsideClick: NSViewRepresentable {
    let isEditing: Bool
    let dismiss: () -> Void

    func makeNSView(context: Context) -> MonitorView { MonitorView() }

    func updateNSView(_ view: MonitorView, context: Context) {
        view.dismiss = dismiss
        view.setMonitoring(isEditing)
    }

    static func dismantleNSView(_ view: MonitorView, coordinator: ()) {
        view.setMonitoring(false)
    }

    final class MonitorView: NSView {
        var dismiss: () -> Void = {}
        private var monitor: Any?

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        func setMonitoring(_ enabled: Bool) {
            if !enabled {
                if let monitor { NSEvent.removeMonitor(monitor) }
                monitor = nil
                return
            }
            guard monitor == nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
                guard let self, let window = self.window, event.window === window else { return event }
                let location = self.convert(event.locationInWindow, from: nil)
                let fieldRect = self.bounds.intersection(self.visibleRect)
                guard !fieldRect.contains(location) else { return event }
                // Native input controls transfer focus themselves. Clearing it first can cancel that transfer.
                if let content = window.contentView {
                    var target = content.hitTest(content.convert(event.locationInWindow, from: nil))
                    while let view = target {
                        if view is NSTextView || view is NSTextField || view is NSDatePicker { return event }
                        target = view.superview
                    }
                }
                if window.makeFirstResponder(nil) {
                    self.dismiss()
                }
                // Keep the original click so another field, button or menu still works immediately.
                return event
            }
        }

        deinit {
            if let monitor { NSEvent.removeMonitor(monitor) }
        }
    }
}
