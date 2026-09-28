import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';
import { invoiceInput, type SavedInvoice, type Invoice } from '../shared/model';
let h: Awaited<ReturnType<typeof harness>>, a: SavedInvoice, b: SavedInvoice;
before(async () => {
  h = await harness();
  for (const who of ['alice', 'bob']) {
    const input = await h.invoice(who);
    const response = await h.request(who, `/api/invoices/${input.id}`, 'PUT', input);
    assert.equal(response.status, 200, await response.clone().text());
    const doc = (await response.json()) as SavedInvoice;
    if (who === 'alice') a = doc;
    else b = doc;
  }
});
after(async () => {
  await h?.mf.dispose();
});
test('unauthenticated API calls fail closed', async () => {
  for (const path of [
    '/api/me',
    '/api/invoices',
    '/api/templates',
    '/api/admin/users',
    '/api/export',
    '/api/backups',
  ])
    assert.equal((await h.request(null, path)).status, 401);
});
test('each account only lists its own invoices', async () => {
  for (const [who, expected] of [
    ['alice', a],
    ['bob', b],
  ] as const) {
    const response = await h.request(who, '/api/invoices');
    const list = (await response.json()) as { items: { id: string }[] };
    assert.deepEqual(
      list.items.map((i) => i.id),
      [expected.id],
    );
  }
});
test('foreign invoice read, history and revision cannot be retrieved', async () => {
  assert.equal((await h.request('bob', `/api/invoices/${a.id}`)).status, 404);
  assert.equal((await h.request('bob', `/api/invoices/${a.id}/versions/1`)).status, 404);
  assert.deepEqual(await (await h.request('bob', `/api/invoices/${a.id}/versions`)).json(), []);
});
test('foreign updates and trash do not modify the owner document', async () => {
  assert.equal(
    (await h.request('bob', `/api/invoices/${a.id}`, 'PUT', invoiceInput(a))).status,
    409,
  );
  assert.equal(
    (
      await h.request('bob', `/api/invoices/${a.id}/trash`, 'POST', {
        version: a.version,
        restore: false,
      })
    ).status,
    409,
  );
  assert.equal(
    ((await (await h.request('alice', `/api/invoices/${a.id}`)).json()) as SavedInvoice).customer
      .name,
    'Klient alice',
  );
});
test('owner supplied in request body is rejected', async () => {
  assert.equal(
    (
      await h.request('bob', `/api/invoices/${b.id}`, 'PUT', {
        ...invoiceInput(b),
        user_id: h.identities.alice.id,
      })
    ).status,
    400,
  );
});
test('normal user cannot access any admin operation', async () => {
  for (const path of ['/api/admin/users', '/api/admin/templates', '/api/admin/audit'])
    assert.equal((await h.request('alice', path)).status, 403);
  assert.equal(
    (
      await h.request('alice', `/api/admin/users/${h.identities.bob.id}`, 'PUT', {
        status: 'active',
        templates: [],
      })
    ).status,
    403,
  );
});
test('pending account can see own login but cannot access invoices', async () => {
  assert.equal((await h.request('pending', '/api/me')).status, 200);
  assert.equal((await h.request('pending', '/api/invoices')).status, 403);
});
test('CSRF and external origins are rejected', async () => {
  const data = invoiceInput(a);
  assert.equal(
    (await h.request('alice', `/api/invoices/${a.id}`, 'PUT', data, { 'X-CSRF-Token': 'wrong' }))
      .status,
    403,
  );
  assert.equal(
    (
      await h.request('alice', `/api/invoices/${a.id}`, 'PUT', data, {
        Origin: 'https://attacker.example',
      })
    ).status,
    403,
  );
});
test('session forgery fails', async () => {
  assert.equal(
    (
      await h.request(null, '/api/me', 'GET', undefined, {
        Cookie: 'faktury_session=' + '0'.repeat(64),
      })
    ).status,
    401,
  );
});
test('validation rejects negative amounts, unknown scripts and invalid dates', async () => {
  const inputs = [
    { ...invoiceInput(a), paid: '-100' },
    { ...invoiceInput(a), issueDate: '2026-02-30' },
    { ...invoiceInput(a), logo: 'data:image/svg+xml;base64,PHN2Zz4=' },
  ];
  for (const data of inputs)
    assert.equal((await h.request('alice', `/api/invoices/${a.id}`, 'PUT', data)).status, 400);
});
test('only granted templates are returned and accepted on a new document', async () => {
  const templates = (await (await h.request('alice', '/api/templates')).json()) as { id: string }[];
  assert.deepEqual(
    templates.map((t) => t.id),
    ['classic'],
  );
  const input = await h.invoice('alice', '2026010');
  input.templateID = 'mono';
  assert.equal((await h.request('alice', `/api/invoices/${input.id}`, 'PUT', input)).status, 403);
});
test('template config rejects arbitrary HTML and remote image URLs', async () => {
  const response = await h.request('owner', '/api/admin/templates/danger', 'PUT', {
    name: 'Test',
    description: '',
    version: 0,
    archived: false,
    config: {
      layout: 'classic',
      accent: '#123456',
      wordmark: '',
      logo: 'https://evil.example/track.png',
      footer: '',
      html: '<script>alert(1)</script>',
    },
  });
  assert.equal(response.status, 400);
});
test('same invoice number may exist in different accounts but not twice in one', async () => {
  const input = await h.invoice('alice', a.number);
  assert.equal((await h.request('alice', `/api/invoices/${input.id}`, 'PUT', input)).status, 409);
});
test('optimistic locking prevents overwriting a newer save and preserves history', async () => {
  const input = invoiceInput(a);
  input.note = 'Nová poznámka';
  const result = await h.request('alice', `/api/invoices/${a.id}`, 'PUT', input);
  assert.equal(result.status, 200);
  a = (await result.json()) as SavedInvoice;
  assert.equal((await h.request('alice', `/api/invoices/${a.id}`, 'PUT', input)).status, 409);
  const versions = (await (
    await h.request('alice', `/api/invoices/${a.id}/versions`)
  ).json()) as unknown[];
  assert.equal(versions.length, 2);
});
test('revoking templates removes selection, preserves existing invoice snapshot and blocks duplication', async () => {
  const granted = await h.request('owner', `/api/admin/users/${h.identities.alice.id}`, 'PUT', {
    status: 'active',
    templates: [],
  });
  assert.equal(granted.status, 200);
  assert.deepEqual(await (await h.request('alice', '/api/templates')).json(), []);
  const input = invoiceInput(a);
  input.note = 'Po odobratí';
  const result = await h.request('alice', `/api/invoices/${a.id}`, 'PUT', input);
  assert.equal(result.status, 200);
  const saved = (await result.json()) as SavedInvoice;
  assert.deepEqual(saved.templateSnapshot, a.templateSnapshot);
  a = saved;
  const duplicate = { ...invoiceInput(a), id: crypto.randomUUID(), number: '2026011', version: 0 };
  assert.equal(
    (await h.request('alice', `/api/invoices/${duplicate.id}`, 'PUT', duplicate)).status,
    403,
  );
});
test('exports and R2 backups contain only the authenticated account', async () => {
  const exported = await (await h.request('alice', '/api/export')).text();
  assert.ok(exported.includes('Klient alice'));
  assert.ok(!exported.includes('Klient bob'));
  assert.ok(!exported.includes('apple_sub'));
  assert.equal((await h.request('alice', '/api/backups', 'POST', {})).status, 200);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal((await h.request('alice', `/api/backups/${day}`)).status, 200);
  assert.equal((await h.request('bob', `/api/backups/${day}`)).status, 404);
  assert.equal((await h.request('alice', '/api/backups/%2e%2e%2fcontrol')).status, 400);
});
test('admin UI does not grant access to a customers invoices', async () => {
  assert.equal((await h.request('owner', `/api/invoices/${a.id}`)).status, 404);
  const data = await (await h.request('owner', '/api/admin/users')).text();
  assert.ok(!data.includes('Klient alice'));
  assert.ok(!data.includes('apple_sub'));
  assert.ok(!data.includes('apple_refresh'));
});
test('soft deletion is recoverable and does not reuse invoice numbers', async () => {
  assert.equal(
    (
      await h.request('bob', `/api/invoices/${b.id}/trash`, 'POST', {
        version: b.version,
        restore: false,
      })
    ).status,
    200,
  );
  const list = (await (await h.request('bob', '/api/invoices')).json()) as { items: unknown[] };
  assert.equal(list.items.length, 0);
  assert.equal(
    (await h.request('bob', `/api/invoices/${b.id}`, 'PUT', invoiceInput(b))).status,
    409,
  );
  assert.equal(
    (
      await h.request('bob', `/api/invoices/${b.id}/trash`, 'POST', {
        version: b.version + 1,
        restore: true,
      })
    ).status,
    200,
  );
});
test('suspending an account revokes all its sessions immediately', async () => {
  assert.equal(
    (
      await h.request('owner', `/api/admin/users/${h.identities.bob.id}`, 'PUT', {
        status: 'suspended',
        templates: [],
      })
    ).status,
    200,
  );
  assert.equal((await h.request('bob', '/api/me')).status, 401);
});
test('logout revokes server session, not just browser cookie', async () => {
  assert.equal((await h.request('alice', '/api/logout', 'POST', {})).status, 200);
  assert.equal((await h.request('alice', '/api/me')).status, 401);
});
test('unconfigured Apple login never fabricates a session', async () => {
  const response = await h.request(null, '/auth/apple');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/?auth=not-configured');
});
test('security headers prevent framing, caching and third-party resource loading', async () => {
  const response = await h.request(null, '/api/config');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.ok(response.headers.get('Content-Security-Policy')?.includes("default-src 'self'"));
});

test('production Worker does not expose local preview authentication', async () => {
  assert.equal((await h.request(null, '/__preview/login')).status, 404);
});
test('concurrent template edits have one winner and one audit event', async () => {
  const t = (await (await h.request('owner', '/api/admin/templates')).json()) as {
    id: string;
    name: string;
    description: string;
    config: unknown;
    archived: boolean;
    version: number;
  }[];
  const { id, ...template } = t.find((t) => t.id === 'mono')!;
  const results = await Promise.all(
    ['First', 'Second'].map((name) =>
      h.request('owner', '/api/admin/templates/' + id, 'PUT', { ...template, name }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const count = await h.db
    .prepare(
      "SELECT count(*) n FROM audit_events WHERE action='template_saved' AND target_id='mono'",
    )
    .first<{ n: number }>();
  assert.equal(count!.n, 1);
});
