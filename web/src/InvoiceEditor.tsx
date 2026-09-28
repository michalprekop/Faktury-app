import { useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Printer, History } from 'lucide-react';
import {
  invoiceSchema,
  invoiceInput,
  baseConfig,
  type SavedInvoice,
  type Invoice,
  type Profile,
  type Template,
} from '../shared/model';
import { api } from './api';
import { CompanyFields, Field, ErrorBox, Modal, useUnsaved } from './ui';
import { InvoicePaper, paymentPayload } from './InvoicePaper';

export function InvoiceEditor({
  initial,
  profile,
  templates,
  onBack,
  onSaved,
}: {
  initial: Invoice | SavedInvoice;
  profile: Profile;
  templates: Template[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const [invoice, setInvoice] = useState<Invoice>(
    'templateSnapshot' in initial ? invoiceInput(initial) : initial,
  );
  const [saved, setSaved] = useState<SavedInvoice | null>(
    'templateSnapshot' in initial ? initial : null,
  );
  const [tab, setTab] = useState('Údaje');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<{ version: number; created_at: string }[] | null>(null);
  const dirty = !saved || JSON.stringify(invoice) !== JSON.stringify(invoiceInput(saved));
  useUnsaved(dirty);
  const update = (change: Partial<Invoice>) => setInvoice((current) => ({ ...current, ...change }));
  const theme =
    saved?.templateID === invoice.templateID
      ? saved.templateSnapshot
      : (templates.find((t) => t.id === invoice.templateID)?.config ?? baseConfig);
  async function save() {
    setError('');
    const parsed = invoiceSchema.safeParse(invoice);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join(' '),
      );
      return;
    }
    setBusy(true);
    try {
      const next = await api<SavedInvoice>(`/invoices/${invoice.id}`, {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      });
      setSaved(next);
      setInvoice(invoiceInput(next));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor" data-unsaved={dirty}>
      <div className="editor-toolbar">
        <button
          className="icon-button"
          aria-label="Späť na faktúry"
          onClick={() => {
            if (!dirty || confirm('Zmeny ešte nie sú uložené. Opustiť faktúru?')) onBack();
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2>{invoice.version ? 'Faktúra ' + invoice.number : 'Nová faktúra'}</h2>
          <span className={dirty ? 'save-state unsaved' : 'save-state'}>
            {busy ? 'Ukladám…' : dirty ? 'Neuložené zmeny' : 'Uložené v cloude'}
          </span>
        </div>
        <div className="toolbar-actions">
          {saved && (
            <button
              className="button secondary"
              title="História zmien"
              onClick={async () => {
                try {
                  setHistory(await api(`/invoices/${invoice.id}/versions`));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <History size={16} />
            </button>
          )}
          <button
            className="button secondary"
            disabled={dirty || busy}
            title={dirty ? 'Najprv uložte faktúru' : 'Uložiť PDF alebo vytlačiť'}
            onClick={async () => {
              try {
                const paper = document.querySelector('.invoice-paper');
                if (paymentPayload(invoice) && !paper?.querySelector('.qr-code'))
                  throw new Error(
                    'Platobný QR kód ešte nie je pripravený. Skúste tlač o chvíľu alebo opravte platobné údaje.',
                  );
                await Promise.all(
                  Array.from(paper?.querySelectorAll('img') ?? []).map((image) => image.decode()),
                );
                window.print();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Printer size={16} />
            PDF / Tlač
          </button>
          <button className="button" onClick={() => void save()} disabled={busy || !dirty}>
            <Save size={16} />
            Uložiť
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="editor-body">
        <div className="editor-form">
          <div className="tabs">
            {['Údaje', 'Odberateľ', 'Položky', 'Vzhľad'].map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'Údaje' && (
            <div className="form-grid">
              <Field label="Číslo faktúry" wide>
                <input
                  value={invoice.number}
                  onChange={(e) => update({ number: e.target.value })}
                />
              </Field>
              {(['issueDate', 'dueDate', 'deliveryDate'] as const).map((key, i) => (
                <Field key={key} label={['Vystavená', 'Splatnosť', 'Dátum dodania'][i]}>
                  <input
                    type="date"
                    value={invoice[key] ?? ''}
                    onChange={(e) => update({ [key]: e.target.value || null })}
                  />
                </Field>
              ))}
              <Field label="Mena">
                <select
                  value={invoice.currency}
                  onChange={(e) => update({ currency: e.target.value as Invoice['currency'] })}
                >
                  {['EUR', 'CZK', 'USD', 'GBP'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Spôsob úhrady" wide>
                <select
                  value={invoice.paymentMethod}
                  onChange={(e) =>
                    update({ paymentMethod: e.target.value as Invoice['paymentMethod'] })
                  }
                >
                  {['Bankový prevod', 'Hotovosť', 'Karta', 'Dobierka'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bankový účet" wide>
                <select
                  value={invoice.account?.id ?? ''}
                  onChange={(e) =>
                    update({
                      account: profile.accounts.find((a) => a.id === e.target.value) ?? null,
                    })
                  }
                >
                  <option value="">Bez účtu</option>
                  {invoice.account &&
                    !profile.accounts.some((a) => a.id === invoice.account?.id) && (
                      <option value={invoice.account.id}>
                        {invoice.account.name} · uložený na faktúre
                      </option>
                    )}
                  {profile.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.iban.slice(-4)}
                    </option>
                  ))}
                </select>
              </Field>
              {(['variableSymbol', 'constantSymbol', 'specificSymbol'] as const).map((key, i) => (
                <Field
                  key={key}
                  label={['Variabilný symbol', 'Konštantný symbol', 'Špecifický symbol'][i]}
                >
                  <input
                    inputMode="numeric"
                    value={invoice[key]}
                    onChange={(e) => update({ [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Uhradená suma">
                <input
                  inputMode="decimal"
                  value={invoice.paid}
                  onChange={(e) => update({ paid: e.target.value.replace(',', '.') })}
                />
              </Field>
              <Field label="Poznámka" wide>
                <textarea
                  rows={4}
                  value={invoice.note}
                  onChange={(e) => update({ note: e.target.value })}
                />
              </Field>
              <Field label="Vystavil(a)" wide>
                <input
                  value={invoice.issuedBy}
                  onChange={(e) => update({ issuedBy: e.target.value })}
                />
              </Field>
              <details className="wide">
                <summary>Údaje dodávateľa na tejto faktúre</summary>
                <CompanyFields
                  value={invoice.supplier}
                  onChange={(supplier) => update({ supplier })}
                />
              </details>
            </div>
          )}
          {tab === 'Odberateľ' && (
            <CompanyFields value={invoice.customer} onChange={(customer) => update({ customer })} />
          )}
          {tab === 'Položky' && (
            <>
              <div className="line-items">
                {invoice.items.map((item, index) => (
                  <div className="line-item" key={item.id}>
                    <header>
                      <span>Položka {index + 1}</span>
                      <button
                        className="icon-button danger"
                        disabled={invoice.items.length === 1}
                        aria-label={`Odstrániť položku ${index + 1}`}
                        onClick={() =>
                          update({ items: invoice.items.filter((x) => x.id !== item.id) })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </header>
                    <div className="form-grid">
                      {(
                        [
                          'name',
                          'detail',
                          'quantity',
                          'unit',
                          'unitPrice',
                          'discount',
                          'vatRate',
                        ] as const
                      ).map((key, i) => (
                        <Field
                          key={key}
                          label={
                            [
                              'Popis',
                              'Podrobný popis',
                              'Množstvo',
                              'Jednotka',
                              'Cena / jednotka',
                              'Zľava (%)',
                              'DPH (%)',
                            ][i]
                          }
                          wide={i < 2}
                        >
                          <input
                            inputMode={i > 1 && key !== 'unit' ? 'decimal' : 'text'}
                            value={item[key]}
                            onChange={(e) => {
                              const value = [
                                'quantity',
                                'unitPrice',
                                'discount',
                                'vatRate',
                              ].includes(key)
                                ? e.target.value.replace(',', '.')
                                : e.target.value;
                              update({
                                items: invoice.items.map((x) =>
                                  x.id === item.id ? { ...x, [key]: value } : x,
                                ),
                              });
                            }}
                          />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="button secondary full"
                onClick={() =>
                  update({
                    items: [
                      ...invoice.items,
                      {
                        id: crypto.randomUUID(),
                        name: '',
                        detail: '',
                        quantity: '1',
                        unit: 'ks',
                        unitPrice: '0',
                        discount: '0',
                        vatRate: profile.defaultVAT,
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Pridať položku
              </button>
            </>
          )}
          {tab === 'Vzhľad' && (
            <>
              <h3>Šablóna faktúry</h3>
              <p className="muted">Šablóny priradené k vášmu účtu.</p>
              <div className="template-options">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className={'template-option' + (invoice.templateID === t.id ? ' selected' : '')}
                    onClick={() => update({ templateID: t.id })}
                  >
                    <span
                      className={`mini-paper ${t.config.layout}`}
                      style={{ borderTopColor: t.config.accent }}
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
              {saved && !templates.some((t) => t.id === saved.templateID) && (
                <p className="muted">
                  Táto faktúra si uchováva pôvodnú šablónu {saved.templateName}. Pre nové faktúry už
                  nie je dostupná.
                </p>
              )}
              <Field label="Platobný QR kód">
                <select
                  value={invoice.qrFormat}
                  onChange={(e) => update({ qrFormat: e.target.value as Invoice['qrFormat'] })}
                >
                  <option value="automatic">Automaticky SK / CZ</option>
                  <option value="payBySquare">PAY by square</option>
                  <option value="qrPlatba">QR Platba</option>
                  <option value="disabled">Vypnutý</option>
                </select>
              </Field>
            </>
          )}
        </div>
        <div className="paper-stage">
          <InvoicePaper
            invoice={{
              ...invoice,
              items: invoice.items.map((i) => ({
                ...i,
                quantity: /^\d*(\.\d*)?$/.test(i.quantity) ? i.quantity || '0' : '0',
                unitPrice: /^\d*(\.\d*)?$/.test(i.unitPrice) ? i.unitPrice || '0' : '0',
                discount: /^\d*(\.\d*)?$/.test(i.discount) ? i.discount || '0' : '0',
                vatRate: /^\d*(\.\d*)?$/.test(i.vatRate) ? i.vatRate || '0' : '0',
              })),
              paid: /^\d*(\.\d*)?$/.test(invoice.paid) ? invoice.paid || '0' : '0',
            }}
            theme={theme}
          />
          <span className="preview-caption">Náhľad dokumentu · A4</span>
        </div>
      </div>
      {history && (
        <Modal title="História faktúry" onClose={() => setHistory(null)}>
          <p>Predchádzajúcu verziu môžete načítať do editora a následne uložiť ako novú zmenu.</p>
          <div className="history-list">
            {history.map((h) => (
              <button
                key={h.version}
                className="button secondary full"
                onClick={async () => {
                  try {
                    const old = await api<SavedInvoice>(
                      `/invoices/${invoice.id}/versions/${h.version}`,
                    );
                    setInvoice({ ...invoiceInput(old), version: invoice.version });
                    setHistory(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Verzia {h.version}
                <span>{new Date(h.created_at).toLocaleString('sk-SK')}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
