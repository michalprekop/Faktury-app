import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode } from 'bysquare/pay';
import { baseConfig, invoiceInput, invoiceSchema, totals } from '../shared/model';
import { templateExample } from '../shared/template-example';
import { paymentPayload } from '../src/InvoicePaper';

test('template screenshots use a valid, deterministic invoice and the supplied design', () => {
  for (const layout of ['classic', 'mono', 'manoloBay'] as const) {
    const config = { ...baseConfig, layout, wordmark: 'Nová šablóna', footer: 'Vlastná pätička' };
    const invoice = templateExample(config);
    assert.ok(invoiceSchema.safeParse(invoiceInput(invoice)).success);
    assert.deepEqual(invoice, templateExample(config));
    assert.deepEqual(invoice.templateSnapshot, config);
    assert.equal(totals(invoice).total, '1180.00');
    const payment = decode(paymentPayload(invoice)!).payments[0];
    assert.equal(payment.amount, 1180);
    assert.equal(payment.bankAccounts?.[0].iban, invoice.account?.iban);
    // Editing a preview must never mutate the catalog configuration.
    invoice.templateSnapshot.wordmark = 'Zmenené';
    assert.equal(config.wordmark, 'Nová šablóna');
  }
});
