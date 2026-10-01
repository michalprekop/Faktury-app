import { manoloBay } from '../shared/manolo-bay';
import { useEffect, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { encode, CurrencyCode, PaymentOptions } from 'bysquare/pay';
import {
  displayDate,
  money,
  totals,
  type Invoice,
  type TemplateConfig,
  type Company,
  type Profile,
} from '../shared/model';

export function paymentPayload(invoice: Invoice): string | null {
  const sum = totals(invoice);
  if (
    !invoice.account ||
    Number(sum.remaining) <= 0 ||
    invoice.paymentMethod !== 'Bankový prevod' ||
    invoice.qrFormat === 'disabled'
  )
    return null;
  const account = invoice.account,
    iban = account.iban.replace(/\s/g, '').toUpperCase();
  const czech =
    invoice.qrFormat === 'qrPlatba' ||
    (invoice.qrFormat === 'automatic' &&
      /^(CZ|Česko|Česká republika|Czechia)$/i.test(invoice.customer.country));
  const safe = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 .\-]/g, '')
      .slice(0, 60);
  if (czech)
    return (
      `SPD*1.0*ACC:${iban}*AM:${sum.remaining}*CC:${invoice.currency}*MSG:${safe('Faktura ' + invoice.number)}` +
      (invoice.variableSymbol ? `*X-VS:${invoice.variableSymbol}` : '') +
      (invoice.constantSymbol ? `*X-KS:${invoice.constantSymbol}` : '') +
      (invoice.specificSymbol ? `*X-SS:${invoice.specificSymbol}` : '')
    );
  return encode({
    payments: [
      {
        type: PaymentOptions.PaymentOrder,
        amount: Number(sum.remaining),
        currencyCode: invoice.currency as CurrencyCode,
        variableSymbol: invoice.variableSymbol || undefined,
        constantSymbol: invoice.constantSymbol || undefined,
        specificSymbol: invoice.specificSymbol || undefined,
        paymentNote: 'Faktura ' + invoice.number,
        beneficiary: { name: account.holderName || invoice.supplier.name },
        bankAccounts: [{ iban, bic: account.swift || undefined }],
      },
    ],
  });
}
import { CompanyFields, Modal } from './ui';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';

type Edit = { update: (change: Partial<Invoice>) => void; profile: Profile };
function Inline({
  label,
  value,
  onChange,
  numeric = false,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  numeric?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  if (!onChange) return <span className={numeric ? 'numeric' : ''}>{value}</span>;
  return multiline ? (
    <textarea
      aria-label={label}
      className="paper-inline"
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      onChange={(e) => onChange(e.target.value)}
      onInput={(e) => {
        e.currentTarget.style.height = 'auto';
        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
      }}
      ref={(node) => {
        if (node) {
          node.style.height = 'auto';
          node.style.height = node.scrollHeight + 'px';
        }
      }}
    />
  ) : (
    <input
      aria-label={label}
      className={'paper-inline ' + (numeric ? 'numeric' : '')}
      value={value}
      placeholder={placeholder ?? label.split(' – ').at(-1)}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function Party({
  value,
  title,
  onChange,
  profile,
}: {
  value: Company;
  title: string;
  onChange?: (v: Company) => void;
  profile?: Profile;
}) {
  const [details, setDetails] = useState(false);
  const field = (key: keyof Company, label: string, numeric = false) => (
    <Inline
      label={title + ' – ' + label}
      value={String(value[key] ?? '')}
      numeric={numeric}
      multiline={['name', 'street', 'city'].includes(key)}
      placeholder={['companyID', 'taxID', 'vatID'].includes(key) ? '—' : undefined}
      onChange={onChange ? (v) => onChange({ ...value, [key]: v }) : undefined}
    />
  );
  return (
    <section className="original-party">
      <h3>
        {title}
        {onChange && (
          <span className="party-controls">
            <button
              title={'Nastavenia ' + (title === 'DODÁVATEĽ' ? 'dodávateľa' : 'odberateľa')}
              onClick={() => setDetails(true)}
            >
              <MoreHorizontal size={15} />
            </button>
            {profile && (
              <select
                aria-label="Vybrať odberateľa"
                value=""
                onChange={(e) => {
                  const c = profile.customers?.find((c) => c.id === e.target.value);
                  if (c) onChange(c);
                }}
              >
                <option value="">⌄</option>
                {profile.customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </span>
        )}
      </h3>
      <strong>{field('name', 'Názov / meno')}</strong>
      <div>{field('street', 'Ulica a číslo')}</div>
      <div className="address-line">
        {field('postalCode', 'PSČ')}
        {field('city', 'Mesto')}
      </div>
      <div>{field('country', 'Krajina')}</div>
      <div className="identifiers">
        {(['companyID', 'taxID', 'vatID'] as const).map(
          (k, i) =>
            (value[k] || (onChange && (k !== 'vatID' || value.vatPayer))) && (
              <div key={k}>
                <span>{['IČO', 'DIČ', 'IČ DPH'][i]}:</span>
                {field(k, ['IČO', 'DIČ', 'IČ DPH'][i], true)}
              </div>
            ),
        )}
      </div>
      {details && (
        <Modal
          title={title === 'DODÁVATEĽ' ? 'Dodávateľ' : 'Odberateľ'}
          onClose={() => setDetails(false)}
        >
          <CompanyFields value={value} onChange={onChange!} />
          <button className="button" onClick={() => setDetails(false)}>
            Hotovo
          </button>
        </Modal>
      )}
    </section>
  );
}
export function InvoicePaper({
  invoice,
  theme,
  edit,
}: {
  invoice: Invoice;
  theme: TemplateConfig;
  templateName?: string;
  edit?: Edit;
}) {
  const sum = totals(invoice),
    manolo = theme.layout === 'manoloBay',
    mono = theme.layout === 'mono' || manolo;
  const [qr, setQR] = useState(''),
    [qrError, setQRError] = useState('');
  useEffect(() => {
    let active = true;
    setQR('');
    setQRError('');
    if (edit) return;
    try {
      const payload = paymentPayload(invoice);
      if (payload)
        void QRCode.toDataURL(payload, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
          .then((v) => {
            if (active) setQR(v);
          })
          .catch(() => {
            if (active) setQRError('QR sa nepodarilo vytvoriť.');
          });
    } catch {
      setQRError('Skontrolujte platobné údaje.');
    }
    return () => {
      active = false;
    };
  }, [invoice, Boolean(edit)]);
  const field = (
    key:
      | 'number'
      | 'variableSymbol'
      | 'constantSymbol'
      | 'specificSymbol'
      | 'orderNumber'
      | 'note'
      | 'issuedBy'
      | 'paid',
    label: string,
    numeric = false,
    multiline = false,
  ) => (
    <Inline
      label={label}
      value={invoice[key] ?? ''}
      onChange={edit ? (v) => edit.update({ [key]: numeric ? v.replace(',', '.') : v }) : undefined}
      numeric={numeric}
      multiline={multiline}
    />
  );
  return (
    <article
      className={'invoice-paper original-paper ' + (manolo ? 'mono manoloBay' : theme.layout)}
      style={{ '--invoice-accent': manolo ? manoloBay.accent : theme.accent } as CSSProperties}
      aria-label={edit ? 'Upraviteľná faktúra' : 'Náhľad faktúry'}
    >
      {manolo && (
        <>
          {/* Scope the edge-to-edge print page to this template, including Safari. */}
          <style media="print">{'@page { size: A4; margin: 0; }'}</style>
          <img className="manolo-background" src={manoloBay.background} alt="" />
        </>
      )}
      {manolo ? (
        <div className="manolo-header">
          <img className="manolo-logo" src={manoloBay.logo} alt="Manolo & Bay" />
        </div>
      ) : (
        mono && (
          <div className="original-wordmark">
            {theme.logo ? (
              <img src={theme.logo} alt={theme.wordmark || 'Logo dodávateľa'} />
            ) : (
              theme.wordmark && <strong>{theme.wordmark}</strong>
            )}
          </div>
        )
      )}
      <header className="original-title">
        {mono ? (
          <>
            <div>
              <small>Číslo faktúry</small>
              <h1>{field('number', 'Číslo faktúry', true)}</h1>
            </div>
            <b>FAKTÚRA</b>
          </>
        ) : (
          <>
            <b>FAKTÚRA</b>
            <h1>{field('number', 'Číslo faktúry', true)}</h1>
          </>
        )}
      </header>
      <div className="original-parties">
        <Party
          value={invoice.supplier}
          title="DODÁVATEĽ"
          onChange={edit ? (supplier) => edit.update({ supplier }) : undefined}
        />
        <Party
          value={invoice.customer}
          title="ODBERATEĽ"
          onChange={edit ? (customer) => edit.update({ customer }) : undefined}
          profile={edit?.profile}
        />
      </div>
      <div className="original-registration">
        <Inline
          label="Zápis v registri"
          multiline
          value={invoice.supplier.registration}
          onChange={
            edit
              ? (v) => edit.update({ supplier: { ...invoice.supplier, registration: v } })
              : undefined
          }
        />
      </div>
      <div className="original-dates">
        {(['issueDate', 'dueDate', 'deliveryDate'] as const).map(
          (key, i) =>
            (key !== 'deliveryDate' || invoice.deliveryDate) && (
              <div key={key}>
                <small>{['Dátum vystavenia', 'Dátum splatnosti', 'Dátum dodania'][i]}</small>
                {edit ? (
                  <input
                    aria-label={['Dátum vystavenia', 'Dátum splatnosti', 'Dátum dodania'][i]}
                    type="date"
                    value={invoice[key] ?? ''}
                    onChange={(e) => edit.update({ [key]: e.target.value })}
                  />
                ) : (
                  <span className="numeric">{displayDate(invoice[key] ?? '')}</span>
                )}
              </div>
            ),
        )}
        <div>
          <small>Forma úhrady</small>
          {edit ? (
            <select
              aria-label="Forma úhrady"
              value={invoice.paymentMethod}
              onChange={(e) =>
                edit.update({ paymentMethod: e.target.value as Invoice['paymentMethod'] })
              }
            >
              {['', 'Bankový prevod', 'Hotovosť', 'Karta', 'Dobierka'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : (
            invoice.paymentMethod
          )}
        </div>
      </div>
      <div className="original-bank">
        {edit ? (
          <select
            aria-label="Bankový účet"
            value={invoice.account?.id ?? ''}
            onChange={(e) =>
              edit.update({
                account: edit.profile.accounts.find((a) => a.id === e.target.value) ?? null,
              })
            }
          >
            <option value="">Bez účtu</option>
            {invoice.account &&
              !edit.profile.accounts.some((a) => a.id === invoice.account!.id) && (
                <option value={invoice.account.id}>{invoice.account.iban}</option>
              )}
            {edit.profile.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.iban.replace(/(.{4})/g, '$1 ')}
                {a.swift ? ' / ' + a.swift : ''}
              </option>
            ))}
          </select>
        ) : (
          invoice.account && (
            <span className="numeric">
              {invoice.account.iban.replace(/(.{4})/g, '$1 ')}
              {invoice.account.swift ? ' / ' + invoice.account.swift : ''}
            </span>
          )
        )}
        <div className="original-symbols">
          <span>Variabilný symbol:</span>
          {field('variableSymbol', 'Variabilný symbol', true)}
          {invoice.constantSymbol && (
            <>
              <span>KS:</span>
              {field('constantSymbol', 'Konštantný symbol', true)}
            </>
          )}
          {invoice.specificSymbol && (
            <>
              <span>ŠS:</span>
              {field('specificSymbol', 'Špecifický symbol', true)}
            </>
          )}
        </div>
        {invoice.orderNumber && <div>Objednávka: {field('orderNumber', 'Objednávka')}</div>}
      </div>
      <table className="original-items">
        <thead>
          <tr>
            <th>POLOŽKA</th>
            <th>POČET</th>
            <th>JEDNOTKA</th>
            <th>CENA / MJ</th>
            <th>{invoice.supplier.vatPayer ? 'SPOLU S DPH' : 'SPOLU'}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => {
            const change = (key: string, v: string) =>
              edit?.update({
                items: invoice.items.map((x) =>
                  x.id === item.id
                    ? {
                        ...x,
                        [key]: ['quantity', 'unitPrice', 'discount', 'vatRate'].includes(key)
                          ? v.replace(',', '.')
                          : v,
                      }
                    : x,
                ),
              });
            return (
              <tr key={item.id}>
                <td>
                  <strong>
                    <Inline
                      label="Názov položky"
                      value={item.name}
                      onChange={edit ? (v) => change('name', v) : undefined}
                      multiline
                    />
                  </strong>
                  {(item.detail || edit) && (
                    <div className="item-detail">
                      <Inline
                        label="Podrobný popis"
                        value={item.detail}
                        onChange={edit ? (v) => change('detail', v) : undefined}
                        multiline
                      />
                    </div>
                  )}
                  {edit ? (
                    <details className="item-menu">
                      <summary title="Možnosti položky">
                        <MoreHorizontal size={15} />
                      </summary>
                      <label>
                        Zľava %
                        <Inline
                          label="Zľava %"
                          value={item.discount}
                          numeric
                          onChange={(v) => change('discount', v)}
                        />
                      </label>
                      {invoice.supplier.vatPayer && (
                        <label>
                          DPH %
                          <Inline
                            label="DPH %"
                            value={item.vatRate}
                            numeric
                            onChange={(v) => change('vatRate', v)}
                          />
                        </label>
                      )}
                      <button
                        disabled={invoice.items.length === 1}
                        onClick={() =>
                          edit.update({ items: invoice.items.filter((i) => i.id !== item.id) })
                        }
                      >
                        <Trash2 size={13} /> Odstrániť položku
                      </button>
                    </details>
                  ) : (
                    Number(item.discount) > 0 && <small>Zľava {item.discount} %</small>
                  )}
                </td>
                <td>
                  <Inline
                    label="Množstvo"
                    value={item.quantity}
                    numeric
                    onChange={edit ? (v) => change('quantity', v) : undefined}
                  />
                </td>
                <td>
                  <Inline
                    label="Jednotka"
                    value={item.unit}
                    onChange={edit ? (v) => change('unit', v) : undefined}
                  />
                </td>
                <td>
                  <Inline
                    label="Cena / MJ"
                    value={edit ? item.unitPrice : money(item.unitPrice, invoice.currency)}
                    numeric
                    onChange={edit ? (v) => change('unitPrice', v) : undefined}
                  />
                </td>
                <td className="numeric">{money(sum.rows[index].total, invoice.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {edit && (
        <div className="original-add">
          <button
            onClick={() =>
              edit.update({
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
                    vatRate: edit.profile.defaultVAT,
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Pridať položku
          </button>
          <select
            aria-label="Mena"
            value={invoice.currency}
            onChange={(e) => edit.update({ currency: e.target.value as Invoice['currency'] })}
          >
            {['EUR', 'CZK', 'USD', 'GBP'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      )}
      <div className="original-closing">
        <div className="original-note">
          {field('note', 'Poznámka', false, true)}
          {!edit && qr && <img className="qr-code" src={qr} alt="Platobný QR kód" />}
          {qrError && <span role="alert">{qrError}</span>}
        </div>
        <section className="original-totals">
          {invoice.supplier.vatPayer && (
            <>
              <p>
                <span>Základ dane</span>
                <b className="numeric">{money(sum.net, invoice.currency)}</b>
              </p>
              {sum.taxRates.map((r) => (
                <p key={r.rate}>
                  <span>DPH {r.rate} %</span>
                  <b className="numeric">{money(r.vat, invoice.currency)}</b>
                </p>
              ))}
            </>
          )}
          <p>
            <span>Celková suma</span>
            <b className="numeric">{money(sum.total, invoice.currency)}</b>
          </p>
          <p>
            <span>Uhradené</span>
            <span>
              {edit ? field('paid', 'Uhradené', true) : money(invoice.paid, invoice.currency)}{' '}
              {edit && invoice.currency}
            </span>
          </p>
          {manolo ? (
            <div className="original-remaining manolo-payment-summary">
              <div>
                <small>Variabilný symbol</small>
                <strong className="numeric">{invoice.variableSymbol || '—'}</strong>
              </div>
              <div>
                <small>Dátum splatnosti</small>
                <strong className="numeric">{displayDate(invoice.dueDate)}</strong>
              </div>
              <div>
                <small>Suma na úhradu</small>
                <strong className="numeric">{money(sum.remaining, invoice.currency)}</strong>
              </div>
            </div>
          ) : (
            <p className="original-remaining">
              <span>Suma na úhradu</span>
              <b className="numeric">{money(sum.remaining, invoice.currency)}</b>
            </p>
          )}
          {Number(sum.overpaid) > 0 && (
            <p>
              <span>Preplatok</span>
              <b className="numeric">{money(sum.overpaid, invoice.currency)}</b>
            </p>
          )}
          <small>Podpis a pečiatka</small>
          {invoice.signature && (
            <img className="signature" src={invoice.signature} alt="Podpis a pečiatka" />
          )}
        </section>
      </div>
      {!mono && (
        <div className="original-payment-band">
          {[
            ['IBAN', invoice.account?.iban.replace(/(.{4})/g, '$1 ') ?? invoice.paymentMethod],
            ['Variabilný symbol', invoice.variableSymbol],
            ['Splatnosť', displayDate(invoice.dueDate)],
            ['Na úhradu', money(sum.remaining, invoice.currency)],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong className="numeric">{value}</strong>
            </div>
          ))}
        </div>
      )}
      <footer className="original-footer">
        {!manolo && theme.footer && <p>{theme.footer}</p>}
        {manolo ? (
          <div>
            {manoloBay.contacts.map((contact) => (
              <span key={contact}>{contact}</span>
            ))}
          </div>
        ) : (
          <div>
            <span>Vystavil: {field('issuedBy', 'Vystavil')}</span>
            {[invoice.supplier.website, invoice.supplier.email, invoice.supplier.phone]
              .filter(Boolean)
              .map((c, i) => (
                <span key={i}>{c}</span>
              ))}
          </div>
        )}
        {!mono && (theme.logo || invoice.logo) && (
          <img src={theme.logo || invoice.logo} alt="Logo dodávateľa" />
        )}
      </footer>
    </article>
  );
}
