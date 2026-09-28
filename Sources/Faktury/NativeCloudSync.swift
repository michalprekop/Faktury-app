import Foundation
import SwiftUI
import WebKit
import Combine
import InvoiceCore

/// Native views keep their original autosave workflow. Each Apple identity has its own cache.
@MainActor final class NativeCloudSync: ObservableObject {
    struct User: Codable { var id: String; var name: String; var email: String; var role: String; var status: String }
    struct Me: Decodable { var user: User; var csrf: String }
    struct Profile: Codable { var settings: InvoiceCore.Settings; var customers: [Company]; var version: Int; var defaultTemplateID: String? }
    struct RemoteInvoice: Decodable { var invoice: Invoice; var version: Int }
    struct Row: Decodable { var id: UUID; var version: Int }
    struct Page: Decodable { var items: [Row]; var nextOffset: Int? }
    struct Acknowledgement: Decodable { var version: Int }
    struct State: Codable {
        var database: Database
        var profileVersion: Int
        var versions: [UUID: Int]
    }
    @Published var store: Store?
    @Published var user: User?
    @Published var message = "Pripájam účet…"
    @Published var failure: String?
    @Published var connecting = true
    @Published var syncing = false
    let authentication = CloudWorkspace()
    private var csrf = ""
    private var cookie = ""
    private var state: State?
    private var observation: AnyCancellable?
    private var debounce: Task<Void, Never>?
    private var polling: Task<Void, Never>?
    private var applying = false
    private var rerun = false
    private var stateURL: URL? { store?.url.deletingLastPathComponent().appendingPathComponent("cloud-sync.json") }
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 30
        return URLSession(configuration: config)
    }()
    init() {
        authentication.onAuthenticated = { [weak self] in Task { await self?.connect() } }
    }
    func signIn() { authentication.signIn() }
    private func request<T: Decodable>(_ path: String, method: String = "GET", data: Data? = nil) async throws -> T {
        var request = URLRequest(url: URL(string: "/api/" + path, relativeTo: CloudEndpoint.origin)!.absoluteURL)
        request.httpMethod = method
        request.httpBody = data
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue(CloudEndpoint.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (bytes, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, CloudEndpoint.trusted(http.url) else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any]
            throw DataError.invalid(object?["error"] as? String ?? "Cloud je nedostupný (\(http.statusCode)).")
        }
        return try JSONDecoder().decode(T.self, from: bytes)
    }
    func connect() async {
        guard !syncing else { return }
        connecting = true; failure = nil
        do {
            let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            guard let found = cookies.first(where: { $0.name == "__Host-faktury_session" && $0.domain == CloudEndpoint.origin.host && $0.isSecure && $0.isHTTPOnly && ($0.expiresDate ?? .distantFuture) > Date() }) else {
                connecting = false; message = "Prihláste sa cez Apple"; return
            }
            cookie = HTTPCookie.requestHeaderFields(with: [found])["Cookie"] ?? ""
            let me: Me = try await request("me")
            guard UUID(uuidString: me.user.id) != nil else { throw URLError(.badServerResponse) }
            user = me.user; csrf = me.csrf
            guard me.user.status == "active" else { throw DataError.invalid("Účet čaká na aktiváciu správcom.") }
            let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("sk.faktury.desktop/accounts/" + me.user.id)
            let accountStore = Store(dataDirectory: directory)
            guard !accountStore.loadFailed else { throw DataError.invalid(accountStore.error ?? "Údaje účtu sa nepodarilo načítať.") }
            store = accountStore
            if let stateURL, FileManager.default.fileExists(atPath: stateURL.path) {
                state = try JSONDecoder().decode(State.self, from: Data(contentsOf: stateURL))
            }
            await synchronize()
            if state == nil { store = nil; connecting = false; return }
            observation = accountStore.$database.dropFirst().sink { [weak self] _ in self?.schedule() }
            polling?.cancel()
            polling = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                    await self?.synchronize()
                }
            }
        } catch { failure = error.localizedDescription; message = "Pripojenie účtu sa nepodarilo" }
        connecting = false
    }
    private func schedule() {
        guard !applying else { return }
        message = "Ukladám do cloudu…"
        debounce?.cancel()
        debounce = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(1)) } catch { return }
            await self?.synchronize()
        }
    }
    private func persistState() throws {
        guard let state, let stateURL else { return }
        try JSONEncoder().encode(state).write(to: stateURL, options: [.atomic, .completeFileProtectionUnlessOpen])
    }
    func synchronize() async {
        guard let store, user?.status == "active" else { return }
        guard !syncing else { rerun = true; return }
        guard store.flushInvoices(), store.flushSettings() else {
            message = "Rozpracované uložené v Macu"; return
        }
        syncing = true
        defer {
            syncing = false
            if rerun { rerun = false; schedule() }
        }
        let local = store.database
        do {
            let profile: Profile = try await request("native/profile")
            let templates: [CloudInvoiceStyle] = try await request("templates")
            store.cloudTemplates = templates
            var remote: [UUID: Int] = [:]
            var offset: Int? = 0
            repeat {
                let page: Page = try await request("invoices?offset=\(offset!)")
                for row in page.items { remote[row.id] = row.version }
                offset = page.nextOffset
            } while offset != nil
            var base = state ?? State(database: Database(), profileVersion: profile.version, versions: [:])
            let initial = state == nil
            let changed = initial ? [] : local.invoices.filter { invoice in base.database.invoices.first(where: { $0.id == invoice.id }) != invoice }
            let deleted = initial ? [] : base.database.invoices.filter { invoice in !local.invoices.contains(where: { $0.id == invoice.id }) }
            let profileChanged = !initial && (local.settings != base.database.settings || local.customers != base.database.customers)
            guard !profileChanged || profile.version == base.profileVersion,
                  (changed + deleted).allSatisfy({ remote[$0.id] == base.versions[$0.id] }) else {
                throw DataError.invalid("Faktúru alebo nastavenia zmenilo iné zariadenie. Vaše úpravy zostali uložené v tomto Macu. Pred pokračovaním porovnajte verziu na webe.")
            }
            if profileChanged {
                let selected = local.settings.cloudTemplateID ?? templates.first(where: { $0.layout == local.settings.defaultInvoiceTemplate })?.id
                let input = Profile(settings: local.settings, customers: local.customers, version: base.profileVersion, defaultTemplateID: selected)
                var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as! [String: Any]
                object.removeValue(forKey: "defaultTemplateID"); object["templateID"] = selected ?? NSNull() as Any
                let ack: Acknowledgement = try await request("native/profile", method: "PUT", data: JSONSerialization.data(withJSONObject: object))
                base.profileVersion = ack.version; base.database.settings = local.settings; base.database.customers = local.customers
                state = base; try persistState()
            }
            for invoice in changed {
                let selected = invoice.cloudStyle?.id ?? local.settings.cloudTemplateID ?? templates.first(where: { $0.layout == invoice.resolvedTemplate(default: local.settings.defaultInvoiceTemplate) })?.id
                guard let selected else { throw DataError.invalid("Správca musí priradiť šablónu faktúry.") }
                struct Input: Encodable { var invoice: Invoice; var version: Int; var templateID: String }
                let ack: Acknowledgement = try await request("native/invoices/\(invoice.id.uuidString)", method: "PUT", data: JSONEncoder().encode(Input(invoice: invoice, version: base.versions[invoice.id] ?? 0, templateID: selected)))
                base.database.invoices.removeAll { $0.id == invoice.id }; base.database.invoices.append(invoice)
                base.versions[invoice.id] = ack.version; remote[invoice.id] = ack.version
                state = base; try persistState()
            }
            for invoice in deleted {
                struct Input: Encodable { var version: Int; var restore = false }
                struct Ack: Decodable { var ok: Bool }
                let _: Ack = try await request("invoices/\(invoice.id.uuidString)/trash", method: "POST", data: JSONEncoder().encode(Input(version: base.versions[invoice.id]!)))
                base.database.invoices.removeAll { $0.id == invoice.id }; base.versions[invoice.id] = nil; remote[invoice.id] = nil
                state = base; try persistState()
            }
            var next = store.database
            var refreshed = false
            if initial || (!profileChanged && profile.version != base.profileVersion) {
                guard initial || (next.settings == local.settings && next.customers == local.customers && store.pendingSettings == nil) else {
                    throw DataError.invalid("Nastavenia sa zmenili počas synchronizácie. Zmeny sú uložené v Macu.")
                }
                next.settings = profile.settings; next.customers = profile.customers
                base.database.settings = profile.settings; base.database.customers = profile.customers; base.profileVersion = profile.version
                refreshed = true
            }
            for (id, version) in remote where initial || base.versions[id] != version {
                let current = next.invoices.first { $0.id == id }
                guard current == local.invoices.first(where: { $0.id == id }), !store.invoiceRecovery.contains(where: { $0.id == id }) else {
                    throw DataError.invalid("Faktúra sa práve upravuje. Synchronizáciu zopakujem po uložení.")
                }
                let value: RemoteInvoice = try await request("native/invoices/\(id.uuidString)")
                guard store.database.invoices.first(where: { $0.id == id }) == current else { rerun = true; continue }
                next.invoices.removeAll { $0.id == id }; next.invoices.append(value.invoice)
                base.database.invoices.removeAll { $0.id == id }; base.database.invoices.append(value.invoice)
                base.versions[id] = value.version; refreshed = true
            }
            for invoice in base.database.invoices where remote[invoice.id] == nil {
                guard next.invoices.first(where: { $0.id == invoice.id }) == invoice,
                      !store.invoiceRecovery.contains(where: { $0.id == invoice.id }) else { continue }
                next.invoices.removeAll { $0.id == invoice.id }; base.database.invoices.removeAll { $0.id == invoice.id }
                base.versions[invoice.id] = nil; refreshed = true
            }
            if refreshed {
                // Do not overwrite edits made while network requests were in flight.
                guard store.database == local else { rerun = true; return }
                applying = true
                let ok = store.applyCloud(next)
                applying = false
                guard ok else { throw DataError.invalid(store.error ?? "Údaje sa nepodarilo uložiť do Macu.") }
            }
            state = base; try persistState()
            failure = nil; message = "Uložené v cloude"
            if store.database != local && !refreshed { rerun = true }
        } catch { failure = error.localizedDescription; message = "Uložené v Macu · cloud čaká" }
    }
    func signOut() async {
        await synchronize()
        guard failure == nil, !syncing else { return }
        do {
            struct Ack: Decodable { var ok: Bool }
            let _: Ack = try await request("logout", method: "POST", data: Data("{}".utf8))
            let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            for c in cookies where c.name == "__Host-faktury_session" && c.domain == CloudEndpoint.origin.host {
                await WKWebsiteDataStore.default().httpCookieStore.deleteCookie(c)
            }
            observation = nil; debounce?.cancel(); polling?.cancel(); store = nil; state = nil; user = nil; cookie = ""; csrf = ""; message = "Prihláste sa cez Apple"
        } catch { failure = error.localizedDescription }
    }
}
