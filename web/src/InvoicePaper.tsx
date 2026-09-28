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
function CompanyBlock({ value, title }: { value: Company; title: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <strong>{value.name || 'Názov firmy'}</strong>
      <p>
        {value.street}
        <br />
        {value.postalCode} {value.city}
        <br />
        {value.country}
      </p>
      <p>
        {value.companyID && (
          <>
            IČO: {value.companyID}
            <br />
          </>
        )}
        {value.taxID && (
          <>
            DIČ: {value.taxID}
            <br />
          </>
        )}
        {value.vatID && (
          <>
            IČ DPH: {value.vatID}
            <br />
          </>
        )}
      </p>
      {(value.email || value.phone) && (
        <p>
          {value.email}
          {value.phone && (
            <>
              <br />
              {value.phone}
            </>
          )}
        </p>
      )}
      {value.website && <p>{value.website}</p>}
      {value.registration && <small>{value.registration}</small>}
    </section>
  );
}
export function InvoicePaper({
  invoice,
  theme,
  templateName,
}: {
  invoice: Invoice;
  theme: TemplateConfig;
  templateName?: string;
}) {
  const sum = totals(invoice);
  const [qr, setQR] = useState(''),
    [qrError, setQRError] = useState('');
  useEffect(() => {
    let active = true;
    setQR('');
    setQRError('');
    try {
      const payload = paymentPayload(invoice);
      if (payload)
        void QRCode.toDataURL(payload, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
          .then((data) => {
            if (active) setQR(data);
          })
          .catch(() => {
            if (active) setQRError('QR sa nepodarilo vytvoriť.');
          });
    } catch {
      setQRError('QR: skontrolujte účet a platobné údaje.');
    }
    return () => {
      active = false;
    };
  }, [invoice]);
  return (
    <article
      className={`invoice-paper ${theme.layout}`}
      style={{ '--invoice-accent': theme.accent } as CSSProperties}
      aria-label="Náhľad faktúry"
    >
      <div className="paper-brand">
        {theme.logo || invoice.logo ? (
          <img src={theme.logo || invoice.logo} alt="Logo dodávateľa" />
        ) : theme.wordmark ? (
          <strong>{theme.wordmark}</strong>
        ) : (
          <span className="paper-brand-name">{invoice.supplier.name || 'Vaša firma'}</span>
        )}
      </div>
      {theme.logo && theme.wordmark && <div className="paper-wordmark">{theme.wordmark}</div>}
      <header className="paper-title">
        <div>
          <span>FAKTÚRA</span>
          <h1>{invoice.number || '2026001'}</h1>
        </div>
        <div className="paper-dates">
          <span>
            Vystavená <b>{displayDate(invoice.issueDate)}</b>
          </span>
          <span>
            Splatnosť <b>{displayDate(invoice.dueDate)}</b>
          </span>
          {invoice.deliveryDate && (
            <span>
              Dodanie <b>{displayDate(invoice.deliveryDate)}</b>
            </span>
          )}
        </div>
      </header>
      <div className="paper-parties">
        <CompanyBlock value={invoice.supplier} title="Dodávateľ" />
        <CompanyBlock value={invoice.customer} title="Odberateľ" />
      </div>
      <table className="paper-items">
        <thead>
          <tr>
            <th>Popis</th>
            <th>Množstvo</th>
            <th>Cena / j.</th>
            {invoice.supplier.vatPayer && <th>DPH</th>}
            <th>Spolu</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name || 'Popis položky'}</strong>
                {item.detail && <p>{item.detail}</p>}
                {Number(item.discount) > 0 && <small>Zľava {item.discount} %</small>}
              </td>
              <td>
                {item.quantity} {item.unit}
              </td>
              <td>{money(item.unitPrice || '0', invoice.currency)}</td>
              {invoice.supplier.vatPayer && <td>{item.vatRate} %</td>}
              <td>{money(sum.rows[i].total, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="paper-payment">
        <section>
          <h3>Platobné údaje</h3>
          <p>{invoice.paymentMethod}</p>
          {invoice.account && (
            <>
              <strong>{invoice.account.name}</strong>
              <p className="iban">
                {invoice.account.iban
                  .replace(/\s/g, '')
                  .replace(/(.{4})/g, '$1 ')
                  .trim()}
              </p>
              {invoice.account.swift && <p>SWIFT: {invoice.account.swift}</p>}
              {invoice.account.holderName && <p>{invoice.account.holderName}</p>}
            </>
          )}
          <p>
            {invoice.variableSymbol && <>VS: {invoice.variableSymbol} </>}
            {invoice.constantSymbol && <>KS: {invoice.constantSymbol} </>}
            {invoice.specificSymbol && <>ŠS: {invoice.specificSymbol}</>}
          </p>
          {qr && <img className="qr-code" src={qr} alt="Platobný QR kód" />}
          {qrError && <small className="error-text">{qrError}</small>}
        </section>
        <section className="paper-totals">
          {invoice.supplier.vatPayer && (
            <>
              <p>
                <span>Základ dane</span>
                <b>{money(sum.net, invoice.currency)}</b>
              </p>
              {sum.taxRates.map((t) => (
                <p key={t.rate}>
                  <span>
                    DPH {t.rate} %<small> zo základu {money(t.net, invoice.currency)}</small>
                  </span>
                  <b>{money(t.vat, invoice.currency)}</b>
                </p>
              ))}
            </>
          )}
          <p className="grand-total">
            <span>Celkom</span>
            <b>{money(sum.total, invoice.currency)}</b>
          </p>
          {Number(invoice.paid) > 0 && (
            <p>
              <span>Uhradené</span>
              <b>{money(invoice.paid, invoice.currency)}</b>
            </p>
          )}
          <p className="remaining">
            <span>Na úhradu</span>
            <b>{money(sum.remaining, invoice.currency)}</b>
          </p>
          {Number(sum.overpaid) > 0 && (
            <p>
              <span>Preplatok</span>
              <b>{money(sum.overpaid, invoice.currency)}</b>
            </p>
          )}
          {invoice.signature && <img className="signature" src={invoice.signature} alt="Podpis" />}
        </section>
      </div>
      <footer className="paper-footer">
        {invoice.note && <p>{invoice.note}</p>}
        {theme.footer && <p>{theme.footer}</p>}
        {invoice.issuedBy && <small>Vystavil(a): {invoice.issuedBy}</small>}
      </footer>
    </article>
  );
}
