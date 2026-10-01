import AppKit
import SwiftUI

extension View {
    func dismissPopupOnBackgroundClick(isPresented: Bool, dismiss: @escaping () -> Void) -> some View {
        background(PopupBackgroundClickMonitor(isPresented: isPresented, dismiss: dismiss))
    }
}

/// Native sheets block their parent window, so its SwiftUI tap gestures do not receive backdrop clicks.
struct PopupBackgroundClickMonitor: NSViewRepresentable {
    let isPresented: Bool
    let dismiss: () -> Void

    func makeNSView(context: Context) -> MonitorView { MonitorView() }

    func updateNSView(_ view: MonitorView, context: Context) {
        view.dismiss = dismiss
        view.setMonitoring(isPresented)
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
                guard let self, let parent = self.window, let sheet = parent.attachedSheet,
                      sheet.attachedSheet == nil,
                      NSApp.modalWindow == nil || NSApp.modalWindow === sheet,
                      let eventWindow = event.window, eventWindow === parent || eventWindow === sheet,
                      let content = parent.contentView else { return event }
                let point = eventWindow.convertPoint(toScreen: event.locationInWindow)
                let background = parent.convertToScreen(content.convert(content.bounds, to: nil))
                guard background.contains(point), !sheet.frame.contains(point) else { return event }
                self.dismiss()
                // The dismissal click must not also activate a button or select an invoice underneath.
                return nil
            }
        }

        deinit {
            if let monitor { NSEvent.removeMonitor(monitor) }
        }
    }
}
