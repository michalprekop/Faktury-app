import SwiftUI
import AppKit
import InvoiceCore
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var store: Store
    @State private var settings = InvoiceCore.Settings()
    @State private var tab = "Moja firma"
    @State private var editingAccount: BankAccount?
    @State private var deletingAccount: BankAccount?
    @State private var backup: Database?
    @State private var invalid: Set<String> = []
    @State private var loaded = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Nastavenia").font(.system(size: 26, weight: .semibold))
                    Spacer()
                }.frame(height: InvoyBrand.controlHeight).padding(.bottom, 20)
                HStack(spacing: 2) {
                    ForEach(["Moja firma", "Bankové účty", "Vzhľad", "Predvoľby faktúry", "Zálohy"], id: \.self) { value in
                        BrandSegment(title: value, selected: tab == value) { tab = value }
                    }
                }.padding(3).background(InvoyBrand.canvas, in: RoundedRectangle(cornerRadius: 9))
                    .padding(.bottom, 44)
                VStack(alignment: .leading, spacing: 24) {
                    switch tab {
                    case "Moja firma":
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Údaje dodávateľa").font(.system(size: 18, weight: .semibold))
                            Text("Zmeny sa použijú na nových faktúrach. Existujúce dokumenty si zachovajú svoje údaje.")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                            CompanyFields(company: $settings.supplier, supplier: true, settingsLayout: true)
                        }
                    case "Bankové účty": accounts
                    case "Vzhľad": InvoiceAppearanceSettings(settings: $settings, invoice: store.database.invoices.max(by: { $0.issueDate < $1.issueDate }) ?? store.database.newInvoice())
                    case "Predvoľby faktúry": defaults
                    default: backups
                    }
                    if let message = store.settingsSaveMessage { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(25).frame(maxWidth: 960)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .environment(\.settingsFormControls, true)
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
            HStack { Text("Bankové účty").font(.system(size: 18, weight: .semibold)); Spacer(); Button { editingAccount = BankAccount() } label: { Label("Pridať účet", systemImage: "plus") }.buttonStyle(BrandButtonStyle()) }
            if settings.accounts.isEmpty { ContentUnavailableView("Žiadne bankové účty", systemImage: "building.columns") }
            ForEach(settings.accounts) { account in
                HStack(spacing: 17) {
                    Image(systemName: "building.columns").font(.system(size: 22)).foregroundStyle(Color.accent).frame(width: 35)
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text.numeric(account.name, size: 15, weight: .semibold)
                            if settings.defaultAccountID == account.id {
                                Text("Predvolený účet").font(.system(size: 13)).foregroundStyle(InvoyBrand.ink)
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(InvoyBrand.yellow, in: RoundedRectangle(cornerRadius: 8))
                            }
                        }
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
        VStack(alignment: .leading, spacing: 16) {
            Text("Predvolené údaje").font(.system(size: 18, weight: .semibold))
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 16) {
                GridRow {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Splatnosť (dní)").font(.system(size: 11)).foregroundStyle(.secondary)
                        Stepper(value: $settings.dueDays, in: 0...365) { Text.numeric("\(settings.dueDays)").frame(maxWidth: .infinity, alignment: .leading) }
                            .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: InvoyBrand.controlHeight)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(InvoyBrand.canvas))
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Mena").font(.system(size: 11)).foregroundStyle(.secondary)
                        BrandDropdown(title: "Mena", value: settings.currency, items: ["EUR", "CZK", "USD", "GBP"].map { currency in
                            BrandDropdownItem(title: currency, selected: settings.currency == currency) { settings.currency = currency }
                        })
                    }
                }
                GridRow {
                    Field("Prefix čísla faktúry", text: $settings.numberPrefix, numeric: true)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Počet číslic poradia").font(.system(size: 11)).foregroundStyle(.secondary)
                        Stepper(value: $settings.numberDigits, in: 1...8) { Text.numeric("\(settings.numberDigits)").frame(maxWidth: .infinity, alignment: .leading) }
                            .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: InvoyBrand.controlHeight)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(InvoyBrand.canvas))
                    }
                }
                GridRow {
                    NumberInput(title: "Predvolená DPH (%)", value: $settings.defaultVAT, key: "defaultVAT", invalid: $invalid)
                    Field("Vystavil(a)", text: $settings.issuedBy)
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Poznámka na faktúre").font(.system(size: 11)).foregroundStyle(.secondary)
                TextField("Poznámka", text: $settings.defaultNote, axis: .vertical)
                    .modifier(FormInputStyle()).lineLimit(3...8)
            }
            HStack { Text("Ďalšie číslo").foregroundStyle(.secondary); Spacer(); Text(nextNumber).font(.system(size: 18, weight: .medium, design: .monospaced)) }
            HStack(alignment: .top, spacing: 16) {
                ImageSetting(title: "Logo firmy", data: $settings.logo)
                ImageSetting(title: "Podpis", data: $settings.signature)
            }.padding(.top, 14)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var nextNumber: String { var db = store.database; db.settings = settings; return db.nextNumber() }

    private var backups: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Zálohy a lokálne dáta").font(.system(size: 18, weight: .semibold))
            HStack(spacing: 12) {
                Button { store.exportBackup() } label: { Label("Exportovať zálohu", systemImage: "square.and.arrow.up") }
                Button { backup = store.selectBackup() } label: { Label("Obnoviť zo zálohy", systemImage: "arrow.counterclockwise") }
            }.buttonStyle(BrandSecondaryButtonStyle()).controlSize(.large)
            Divider()
            LabeledContent("Faktúry") { Text.numeric("\(store.database.invoices.count)", monospaced: true) }
            LabeledContent("Odberatelia") { Text.numeric("\(store.database.customers.count)", monospaced: true) }
            LabeledContent("Bankové účty") { Text.numeric("\(store.database.settings.accounts.count)", monospaced: true) }
            Divider()
            Text(store.url.deletingLastPathComponent().path).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).textSelection(.enabled)
            Button { NSWorkspace.shared.activateFileViewerSelecting([store.url]) } label: { Label("Zobraziť dáta vo Finderi", systemImage: "folder") }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func queueSave() {
        guard loaded else { return }
        store.queueSettingsSave(settings, hasInvalidInput: !invalid.isEmpty)
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
            Text(title).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            HStack(spacing: 12) {
                Group {
                    if let data, let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFit() }
                    else { Image(systemName: "photo").font(.system(size: 26)).foregroundStyle(.tertiary) }
                }.frame(width: 85, height: 45)
                Button(data == nil ? "Vybrať obrázok" : "Vymeniť") { choose() }.buttonStyle(BrandSecondaryButtonStyle())
                Spacer(minLength: 0)
                if data != nil { IconButton("Odstrániť obrázok", "trash") { data = nil }.buttonStyle(BrandIconButtonStyle()) }
            }.padding(17).frame(maxWidth: .infinity)
                .background(InvoyBrand.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(InvoyBrand.canvas, style: StrokeStyle(lineWidth: 1, dash: [4])))
            Text(ProfileImageUpload.help).font(.system(size: 11)).foregroundStyle(.secondary)
            if let error { Text(error).font(.system(size: 11)).foregroundStyle(.red) }
        }
    }
    private func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let bytes = try Data(contentsOf: url)
            try ProfileImageUpload.validate(bytes)
            data = bytes; error = nil
        } catch { self.error = error.localizedDescription }
    }
}
