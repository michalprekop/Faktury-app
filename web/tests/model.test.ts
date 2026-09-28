import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode } from 'bysquare/pay';
import { emptyProfile, freshInvoice, totals, validIBAN, invoiceSchema } from '../shared/model';
import { paymentPayload } from '../src/InvoicePaper';
test('decimal money rounds per line like the native app', () => {
  const i = freshInvoice(emptyProfile(), '2026001', 'classic');
  i.supplier.vatPayer = true;
  i.items[0] = {
    ...i.items[0],
    name: 'Položka',
    quantity: '3',
    unitPrice: '0.335',
    discount: '0',
    vatRate: '23',
  };
  assert.equal(totals(i).net, '1.01');
  assert.equal(totals(i).vat, '0.23');
  assert.equal(totals(i).total, '1.24');
  i.paid = '2';
  assert.equal(totals(i).remaining, '0.00');
  assert.equal(totals(i).overpaid, '0.76');
});
test('PAY by square contains only the selected account and outstanding balance', () => {
  const p = emptyProfile();
  p.supplier.name = 'Test';
  p.accounts = [
    {
      id: crypto.randomUUID(),
      name: 'Test',
      iban: 'SK9611000000002918599669',
      swift: 'TATRSKBX',
      holderName: 'Test',
    },
  ];
  const i = freshInvoice(p, '2026001', 'classic');
  i.items[0].unitPrice = '123.45';
  i.paid = '23.45';
  const decoded = decode(paymentPayload(i)!);
  assert.equal(decoded.payments[0].amount, 100);
  assert.equal(decoded.payments[0].bankAccounts?.length, 1);
  assert.equal(decoded.payments[0].bankAccounts?.[0].iban, p.accounts[0].iban);
  i.paid = '123.45';
  assert.equal(paymentPayload(i), null);
});
test('IBAN checksum and invoice dates are validated', () => {
  assert.ok(validIBAN('SK96 1100 0000 0029 1859 9669'));
  assert.ok(!validIBAN('SK95 1100 0000 0029 1859 9669'));
  const i = freshInvoice(emptyProfile(), '2026001', 'classic');
  assert.ok(!invoiceSchema.safeParse({ ...i, issueDate: '2026-02-31' }).success);
});
test('new profiles contain no personal seed data', () => {
  const profile = emptyProfile();
  assert.equal(profile.supplier.name, '');
  assert.deepEqual(profile.accounts, []);
  assert.equal(profile.logo, '');
  assert.equal(profile.signature, '');
});
test('mixed VAT rates retain separate bases and totals and incomplete input does not crash preview', () => {
  const i = freshInvoice(emptyProfile(), '2026001', 'classic');
  i.supplier.vatPayer = true;
  i.items[0] = { ...i.items[0], unitPrice: '100', vatRate: '23' };
  i.items.push({ ...i.items[0], id: crypto.randomUUID(), unitPrice: '50', vatRate: '5' });
  assert.deepEqual(totals(i).taxRates, [
    { rate: '5', net: '50.00', vat: '2.50' },
    { rate: '23', net: '100.00', vat: '23.00' },
  ]);
  i.items[0].quantity = '.';
  assert.doesNotThrow(() => totals(i));
});
