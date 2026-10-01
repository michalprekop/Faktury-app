import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';
import { toNativeInvoice, fromNativeInvoice, chooseTemplate } from '../shared/native';
import { type Template, type SavedInvoice } from '../shared/model';

test('Manolo & Bay is a separate, unassigned template and keeps its snapshot through web/Mac edits', async () => {
  const h = await harness();
  try {
    const templates = (await h
      .request('owner', '/api/admin/templates')
      .then((r) => r.json())) as Template[];
    const template = templates.find((t) => t.id === 'manolo-bay')!;
    assert.equal(template.name, 'Manolo & Bay');
    assert.equal(template.config.accent, '#F2EEEA');
    assert.equal(chooseTemplate(templates, 'manoloBay')?.id, template.id);
    const available = (await h
      .request('alice', '/api/templates')
      .then((r) => r.json())) as Template[];
    assert.ok(!available.some((t) => t.id === template.id));
    const invoice = await h.invoice('owner');
    invoice.templateID = template.id;
    assert.equal(
      (await h.request('owner', '/api/invoices/' + invoice.id, 'PUT', invoice)).status,
      403,
    );
    await h.db
      .prepare('INSERT INTO template_grants VALUES(?,?)')
      .bind(h.identities.owner.id, template.id)
      .run();
    assert.equal(
      (await h.request('owner', '/api/invoices/' + invoice.id, 'PUT', invoice)).status,
      200,
    );
    const saved = (await h
      .request('owner', '/api/invoices/' + invoice.id)
      .then((r) => r.json())) as SavedInvoice;
    const native = toNativeInvoice(saved);
    assert.equal(native.templateOverride, 'manoloBay');
    assert.deepEqual(native.cloudStyle?.config, template.config);
    native.note = 'Úprava z Macu';
    assert.equal(
      (
        await h.request('owner', '/api/native/invoices/' + invoice.id, 'PUT', {
          invoice: native,
          version: 1,
          templateID: template.id,
        })
      ).status,
      200,
    );
    const restored = (await h
      .request('owner', '/api/invoices/' + invoice.id)
      .then((r) => r.json())) as SavedInvoice;
    assert.deepEqual(restored.templateSnapshot, template.config);
    assert.equal(restored.note, native.note);
    assert.equal(fromNativeInvoice(native, 2, template.id).nativeTemplateOverride, 'manoloBay');
  } finally {
    await h.mf.dispose();
  }
});
