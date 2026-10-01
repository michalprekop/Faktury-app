import SwiftUI
import AppKit
import InvoiceCore
import UniformTypeIdentifiers

struct SettingsView: View {
    var cloud: NativeCloudSync? = nil
    @EnvironmentObject private var store: Store
    @State private var settings = InvoiceCore.Settings()
    @State private var tab = "Moja firma"
    @State private var editingAccount: BankAccount?
    @State private var deletingAccount: BankAccount?
    @State private var backup: Database?
    @State private var invalid: Set<String> = []
    @State private var loaded = false
    private var dirty: Bool { settings != store.database.settings }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Nastavenia").font(.system(size: 26, weight: .semibold))
                Spacer()
                if let cloud { CloudAccountMenu(cloud: cloud) }
                Label(store.settingsSaveMessage != nil ? "Neuložené zmeny" : dirty ? "Ukladám…" : "Uložené",
                      systemImage: store.settingsSaveMessage != nil ? "exclamationmark.circle" : dirty ? "clock" : "checkmark.circle")
                    .foregroundStyle(store.settingsSaveMessage != nil ? Color.red : .secondary).font(.system(size: 12))
            }.padding(25)
            HStack {
                Picker("Nastavenia", selection: $tab) { ForEach(["Moja firma", "Bankové účty", "Vzhľad", "Predvoľby", "Zálohy"], id: \.self) { Text($0) } }.pickerStyle(.segmented).labelsHidden().frame(maxWidth: 740)
                Spacer()
            }.padding(.horizontal, 25).padding(.bottom, 20)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    switch tab {
                    case "Moja firma":
                        HStack(alignment: .top, spacing: 40) {
                            CompanyFields(company: $settings.supplier, supplier: true).frame(maxWidth: 520)
                            VStack(alignment: .leading, spacing: 25) {
                                ImageSetting(title: "Logo", data: $settings.logo)
                                ImageSetting(title: "Podpis a pečiatka", data: $settings.signature)
                            }.frame(width: 200)
                        }
                    case "Bankové účty": accounts
                    case "Vzhľad": InvoiceAppearanceSettings(settings: $settings, invoice: store.database.invoices.max(by: { $0.issueDate < $1.issueDate }) ?? store.database.newInvoice())
                    case "Predvoľby": defaults
                    default: backups
                    }
                    if let message = store.settingsSaveMessage { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }.padding(28).frame(maxWidth: 940, alignment: .leading).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .onAppear { settings = store.pendingSettings ?? store.database.settings; loaded = true }
        .onChange(of: settings) { _, _ in queueSave() }
        .onChange(of: invalid) { _, _ in queueSave() }
        .onDisappear { queueSave(); store.flushSettings(); loaded = false }
        .sheet(item: $editingAccount) { account in
            AccountEditor(account: account) { saved in
                if let index = settings.accounts.firstIndex(where: { $0.id == saved.id }) { settings.accounts[index] = saved }
                else { settings.accounts.append(saved) }
                if settings.defaultAccountID == nil { settings.defaultAccountID = saved.id }
                editingAccount = nil
            }
        }
        .alert("Odstrániť bankový účet?", isPresented: Binding(get: { deletingAccount != nil }, set: { if !$0 { deletingAccount = nil } })) {
            Button("Zrušiť", role: .cancel) { deletingAccount = nil }
            Button("Odstrániť", role: .destructive) {
                if let id = deletingAccount?.id {
                    settings.accounts.removeAll { $0.id == id }
                    if settings.defaultAccountID == id { settings.defaultAccountID = settings.accounts.first?.id }
                }
                deletingAccount = nil
            }
        } message: { Text("Účet zostane uložený v existujúcich faktúrach.") }
        .alert("Obnoviť dáta zo zálohy?", isPresented: Binding(get: { backup != nil }, set: { if !$0 { backup = nil } })) {
            Button("Zrušiť", role: .cancel) { backup = nil }
            Button("Obnoviť", role: .destructive) {
                if let backup, store.restore(backup) { settings = store.database.settings; invalid.removeAll() }
                backup = nil
            }
        } message: { Text("Aktuálne dáta nahradí \(backup?.invoices.count ?? 0) faktúr a \(backup?.customers.count ?? 0) odberateľov zo zálohy. Pred obnovou sa uloží bezpečnostná kópia.") }
    }

    private var accounts: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack { Text("Bankové účty").font(.system(size: 18, weight: .semibold)); Spacer(); Button { editingAccount = BankAccount() } label: { Label("Pridať účet", systemImage: "plus") } }
            if settings.accounts.isEmpty { ContentUnavailableView("Žiadne bankové účty", systemImage: "building.columns") }
            ForEach(settings.accounts) { account in
                HStack(spacing: 17) {
                    Image(systemName: "building.columns").font(.system(size: 22)).foregroundStyle(Color.accent).frame(width: 35)
                    VStack(alignment: .leading, spacing: 7) {
                        HStack { Text.numeric(account.name, size: 15, weight: .semibold); if settings.defaultAccountID == account.id { Text("Predvolený").font(.system(size: 10, weight: .medium)).foregroundStyle(Color.accent) } }
                        Text(Format.iban(account.iban)).font(.system(size: 13, design: .monospaced)).textSelection(.enabled)
                        Text.numeric(account.holderName?.isEmpty == false ? account.holderName! : settings.supplier.name, size: 12)
                        Text.numeric(account.swift, size: 12, monospaced: true).foregroundStyle(.secondary)
                    }
                    Spacer()
                    IconButton("Nastaviť ako predvolený", settings.defaultAccountID == account.id ? "star.fill" : "star") { settings.defaultAccountID = account.id }.foregroundStyle(settings.defaultAccountID == account.id ? Color.accent : .secondary)
                    IconButton("Upraviť účet", "pencil") { editingAccount = account }
                    IconButton("Odstrániť účet", "trash") { deletingAccount = account }
                }.padding(.vertical, 10)
                Divider()
            }
        }
    }

    private var defaults: some View {
        VStack(alignment: .leading, spacing: 24) {
            FormSection(title: "Nové faktúry") {
                Stepper(value: $settings.dueDays, in: 0...365) { Text.numeric("Splatnosť: \(settings.dueDays) dní") }
                Picker("Mena", selection: $settings.currency) { ForEach(["EUR", "CZK", "USD", "GBP"], id: \.self) { Text($0) } }.frame(width: 260)
                NumberInput(title: "Predvolená DPH %", value: $settings.defaultVAT, key: "defaultVAT", invalid: $invalid).frame(width: 180)
                Field("Vystavil", text: $settings.issuedBy)
                VStack(alignment: .leading, spacing: 5) { Text("Predvolená poznámka").font(.system(size: 11)).foregroundStyle(.secondary); TextField("Poznámka", text: $settings.defaultNote, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(3...8) }
            }
            Divider()
            FormSection(title: "Číslovanie") {
                Field("Prefix pred rokom", text: $settings.numberPrefix, numeric: true)
                Stepper(value: $settings.numberDigits, in: 1...8) { Text.numeric("Počet číslic za rokom: \(settings.numberDigits)") }
                HStack { Text("Ďalšie číslo").foregroundStyle(.secondary); Spacer(); Text(nextNumber).font(.system(size: 18, weight: .medium, design: .monospaced)) }
            }
        }.frame(maxWidth: 550)
    }

    private var nextNumber: String { var db = store.database; db.settings = settings; return db.nextNumber() }

    private var backups: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Zálohy a lokálne dáta").font(.system(size: 18, weight: .semibold))
            HStack(spacing: 12) {
                Button { store.exportBackup() } label: { Label("Exportovať zálohu", systemImage: "square.and.arrow.up") }
                Button { backup = store.selectBackup() } label: { Label("Obnoviť zo zálohy", systemImage: "arrow.counterclockwise") }
            }.controlSize(.large)
            Divider()
            LabeledContent("Faktúry") { Text.numeric("\(store.database.invoices.count)", monospaced: true) }
            LabeledContent("Odberatelia") { Text.numeric("\(store.database.customers.count)", monospaced: true) }
            LabeledContent("Bankové účty") { Text.numeric("\(store.database.settings.accounts.count)", monospaced: true) }
            Divider()
            Text(store.url.deletingLastPathComponent().path).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).textSelection(.enabled)
            Button { NSWorkspace.shared.activateFileViewerSelecting([store.url]) } label: { Label("Zobraziť dáta vo Finderi", systemImage: "folder") }
        }.frame(maxWidth: 620)
    }

    private func queueSave() {
        guard loaded else { return }
        store.queueSettingsSave(settings, hasInvalidInput: !invalid.isEmpty)
    }
}

private struct CloudAccountMenu: View {
    @ObservedObject var cloud: NativeCloudSync

    var body: some View {
        BrandDropdown(title: "Cloudový účet", value: "Účet") {
            Text(cloud.user?.name ?? "Lokálna záloha")
            Text(cloud.message)
            if let failure = cloud.failure { Text(failure) }
            Button("Synchronizovať teraz") { Task { await cloud.synchronize() } }
            if cloud.user?.role == "admin" {
                Button("Administrácia") { NSWorkspace.shared.open(CloudEndpoint.origin.appending(queryItems: [URLQueryItem(name: "page", value: "admin")])) }
            }
            Button("Otvoriť web") { NSWorkspace.shared.open(CloudEndpoint.origin) }
            Divider()
            Button("Odhlásiť sa") { Task { await cloud.signOut() } }
        }.frame(width: 110).help(cloud.failure ?? cloud.message)
    }
}

struct AccountEditor: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss
    @State var account: BankAccount
    let onSave: (BankAccount) -> Void
    @State private var message: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Bankový účet").font(.system(size: 20, weight: .semibold))
            Field("Názov banky / účtu", text: $account.name)
            Field("Majiteľ účtu", text: Binding(get: { account.holderName ?? store.database.settings.supplier.name }, set: { account.holderName = $0 }))
            Field("IBAN", text: $account.iban, numeric: true)
            Field("SWIFT / BIC", text: $account.swift, numeric: true)
            if let message { Text(message).foregroundStyle(.red).font(.system(size: 12)) }
            HStack {
                Spacer()
                Button("Zrušiť") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Uložiť účet") {
                    account.iban = account.iban.filter { !$0.isWhitespace }.uppercased()
                    account.swift = account.swift.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                    account.holderName = account.holderName?.trimmingCharacters(in: .whitespacesAndNewlines)
                    if account.isValid { onSave(account) } else { message = "Doplňte názov a platný IBAN." }
                }.buttonStyle(BrandButtonStyle()).keyboardShortcut(.defaultAction)
            }
        }.padding(25).frame(width: 470)
    }
}

struct ImageSetting: View {
    let title: String
    @Binding var data: Data?
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 14, weight: .medium))
            ZStack {
                Color.white
                if let data, let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFit().padding(10) }
                else { Image(systemName: "photo").font(.system(size: 26)).foregroundStyle(.tertiary) }
            }.frame(width: 196, height: 140).border(Color.gray.opacity(0.2))
            HStack {
                Button("Vybrať obrázok") { choose() }
                if data != nil { IconButton("Odstrániť obrázok", "trash") { data = nil } }
            }
            if let error { Text(error).font(.system(size: 11)).foregroundStyle(.red) }
        }
    }
    private func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .tiff]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let bytes = try Data(contentsOf: url)
            guard bytes.count <= 10_000_000, NSImage(data: bytes) != nil else { error = "Vyberte obrázok do 10 MB."; return }
            data = bytes; error = nil
        } catch { self.error = error.localizedDescription }
    }
}
