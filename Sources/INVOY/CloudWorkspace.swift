import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit

/// Only this application's HTTPS origin may invoke the small native bridge.
enum CloudEndpoint {
    static let origin = URL(string: "https://invoy.xyz")!
    static func trusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == origin.host && (url.port == nil || url.port == 443)
    }
}

struct ProductRootView: View {
    @EnvironmentObject private var store: Store
    @StateObject private var cloud = NativeCloudSync()
    var body: some View {
        Group {
            if let accountStore = cloud.store, !cloud.connecting {
                RootView(cloud: cloud).environmentObject(accountStore).id(accountStore.url)
            } else {
                VStack(spacing: 18) {
                    BrandIcon(size: 112).padding(.bottom, 12)
                    Text("Vaše faktúry. Váš pracovný priestor.")
                        .font(.system(size: 24, weight: .medium)).foregroundStyle(InvoyBrand.ink)
                    if cloud.connecting { ProgressView("Načítavam vaše faktúry…") }
                    else {
                        Button { cloud.signIn() } label: {
                            HStack(spacing: 14) {
                                Text("Vytvoriť účet / Prihlásiť sa")
                                Rectangle().fill(InvoyBrand.ink.opacity(0.3)).frame(width: 1, height: 26)
                                Image(systemName: "apple.logo").font(.system(size: 18))
                            }
                        }.buttonStyle(BrandButtonStyle()).controlSize(.large)
                    }
                    if let failure = cloud.failure ?? cloud.authentication.error { Text(failure).foregroundStyle(.red).frame(maxWidth: 500) }
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(InvoyBrand.canvas)
            }
        }
        .task { await cloud.connect() }
    }
}

struct CloudWebView: NSViewRepresentable {
    @ObservedObject var workspace: CloudWorkspace
    func makeNSView(context: Context) -> WKWebView { workspace.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

@MainActor final class CloudWorkspace: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, ASWebAuthenticationPresentationContextProviding {
    @Published var error: String?
    private(set) var webView: WKWebView!
    private var authentication: ASWebAuthenticationSession?
    private var downloads: [WKDownload] = []
    private var allowTermination = false
    override init() {
        super.init()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "invoyPrint")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.print = function(){ window.webkit.messageHandlers.invoyPrint.postMessage('print'); };", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self
        load()
    }
    func load() { error = nil; webView.load(URLRequest(url: CloudEndpoint.origin)) }
    func installTerminationCheck(active: Bool, local: Store) {
        AppDelegate.shared?.flushInvoiceChanges = { [weak self, weak local] in
            guard local?.flushInvoices() != false, local?.flushSettings() != false else { return false }
            guard active, let self, !self.allowTermination else { return true }
            return true
        }
        AppDelegate.shared?.confirmCloudTermination = active ? { [weak self] completion in
            guard let self else { completion(true); return }
            self.confirmLeaving { completion(true) } cancelled: { completion(false) }
        } : nil
    }
    func confirmLeaving(_ completion: @escaping () -> Void, cancelled: @escaping () -> Void = {}) {
        webView.evaluateJavaScript("Boolean(document.querySelector('[data-unsaved=\"true\"]'))") { result, _ in
            Task { @MainActor in
                guard (result as? Bool) == true else { completion(); return }
                let alert = NSAlert(); alert.messageText = "Zmeny ešte nie sú uložené"
                alert.informativeText = "Vráťte sa a použite Uložiť. Odchodom stratíte rozpísané zmeny."
                alert.addButton(withTitle: "Späť do faktúry"); alert.addButton(withTitle: "Odísť bez uloženia")
                if alert.runModal() == .alertSecondButtonReturn { completion() } else { cancelled() }
            }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if CloudEndpoint.trusted(url) {
            if url.path == "/auth/apple" { decisionHandler(.cancel); signIn(); return }
            if action.shouldPerformDownload { decisionHandler(.download); return }
            if action.targetFrame == nil { webView.load(action.request); decisionHandler(.cancel); return }
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, ["https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard CloudEndpoint.trusted(response.response.url) else { decisionHandler(.cancel); return }
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(disposition.lowercased().contains("attachment") ? .download : .allow)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) {
        if (failure as NSError).code != NSURLErrorCancelled { error = "Cloud sa nepodarilo načítať. Skontrolujte internetové pripojenie." }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "invoyPrint", message.frameInfo.isMainFrame, CloudEndpoint.trusted(message.frameInfo.request.url), let window = webView.window else { return }
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.paperSize = NSSize(width: 595.28, height: 841.89)
        info.topMargin = 0; info.bottomMargin = 0; info.leftMargin = 0; info.rightMargin = 0
        let operation = webView.printOperation(with: info)
        operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard CloudEndpoint.trusted(frame.request.url) else { completionHandler(false); return }
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Pokračovať"); alert.addButton(withTitle: "Zrušiť")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard CloudEndpoint.trusted(frame.request.url) else { completionHandler(nil); return }
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false; panel.canChooseFiles = true
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { track(download) }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { track(download) }
    private func track(_ download: WKDownload) { download.delegate = self; downloads.append(download) }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard CloudEndpoint.trusted(response.url) else { completionHandler(nil); return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func downloadDidFinish(_ download: WKDownload) { downloads.removeAll { $0 === download } }
    func download(_ download: WKDownload, didFailWithError failure: Error, resumeData: Data?) {
        downloads.removeAll { $0 === download }; error = "Súbor sa nepodarilo uložiť. Skúste stiahnutie znova."
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { webView.window ?? NSApp.keyWindow ?? ASPresentationAnchor() }
    var onAuthenticated: (() -> Void)?
    func signIn() {
        guard authentication == nil else { return }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { error = "Prihlásenie sa nepodarilo spustiť."; return }
        let verifier = bytes.map { String(format: "%02x", $0) }.joined()
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        let url = CloudEndpoint.origin.appendingPathComponent("auth/apple").appending(queryItems: [URLQueryItem(name: "desktop_challenge", value: challenge)])
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "sk.faktury.desktop") { [weak self] callback, failure in
            Task { @MainActor in
                guard let self else { return }; self.authentication = nil
                guard let callback, callback.scheme == "sk.faktury.desktop", callback.host == "auth", let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value, code.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                    if (failure as? ASWebAuthenticationSessionError)?.code != .canceledLogin { self.error = "Apple prihlásenie sa nepodarilo. Skúste to znova." }; return
                }
                do {
                    var request = URLRequest(url: CloudEndpoint.origin.appendingPathComponent("auth/desktop/exchange"))
                    request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code, "verifier": verifier])
                    let (_, response) = try await URLSession(configuration: .ephemeral).data(for: request)
                    guard let response = response as? HTTPURLResponse, response.statusCode == 200, CloudEndpoint.trusted(response.url) else { throw URLError(.userAuthenticationRequired) }
                    var headers: [String: String] = [:]; for (key, value) in response.allHeaderFields { headers[String(describing: key)] = String(describing: value) }
                    let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: CloudEndpoint.origin).filter { $0.name == "__Host-faktury_session" && $0.isSecure && $0.isHTTPOnly }
                    guard cookies.count == 1 else { throw URLError(.userAuthenticationRequired) }
                    for cookie in cookies { await self.webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) }
                    self.onAuthenticated?()
                    self.load()
                } catch { self.error = "Prihlásenie sa nepodarilo dokončiť. Skúste sa prihlásiť znova." }
            }
        }
        authentication = session; session.presentationContextProvider = self
        if !session.start() { authentication = nil; error = "Apple prihlásenie sa nepodarilo otvoriť." }
    }
}
