import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';
import { emptyCompany, type Profile, type AdminUser, type SavedInvoice } from '../shared/model';

test('admin counts every invoice once including trash and only saved customers per account', async () => {
  const h = await harness();
  try {
    const { profile } = (await (await h.request('alice', '/api/me')).json()) as {
      profile: Profile;
    };
    profile.customers = [
      { ...emptyCompany(), id: crypto.randomUUID(), name: 'Private saved customer one' },
      { ...emptyCompany(), id: crypto.randomUUID(), name: 'Private saved customer two' },
    ];
    await h.db
      .prepare('UPDATE users SET profile=? WHERE id=?')
      .bind(JSON.stringify(profile), h.identities.alice.id)
      .run();
    for (const [who, number] of [
      ['alice', '1'],
      ['alice', '2'],
      ['alice', '3'],
      ['bob', '1'],
    ]) {
      const invoice = await h.invoice(who, number);
      const response = await h.request(who, `/api/invoices/${invoice.id}`, 'PUT', invoice);
      assert.equal(response.status, 200);
      if (who === 'alice' && number === '1') {
        const saved = (await response.json()) as SavedInvoice;
        assert.equal(
          (
            await h.request(who, `/api/invoices/${invoice.id}`, 'PUT', {
              ...invoice,
              version: saved.version,
              note: 'Private invoice note',
            })
          ).status,
          200,
        );
      }
      if (who === 'alice' && number === '2') {
        const saved = (await response.json()) as SavedInvoice;
        assert.equal(
          (
            await h.request(who, `/api/invoices/${invoice.id}/trash`, 'POST', {
              version: saved.version,
              restore: false,
            })
          ).status,
          200,
        );
      }
    }
    const response = await h.request('owner', '/api/admin/users');
    assert.equal(response.status, 200);
    const data = (await response.json()) as { users: AdminUser[] };
    const alice = data.users.find((u) => u.id === h.identities.alice.id)!;
    const bob = data.users.find((u) => u.id === h.identities.bob.id)!;
    const pending = data.users.find((u) => u.id === h.identities.pending.id)!;
    assert.equal(alice.invoice_count, 3);
    assert.equal(alice.customer_count, 2);
    assert.equal(bob.invoice_count, 1);
    assert.equal(bob.customer_count, 0);
    assert.equal(pending.invoice_count, 0);
    assert.equal(pending.customer_count, 0);
    assert.equal(pending.last_seen_at, null);
    assert.deepEqual(
      Object.keys(alice).sort(),
      [
        'id',
        'name',
        'email',
        'role',
        'status',
        'created_at',
        'last_seen_at',
        'invoice_count',
        'customer_count',
      ].sort(),
    );
    assert.ok(!JSON.stringify(data).includes('Private'));
    assert.equal((await h.request('alice', '/api/admin/users')).status, 403);
    assert.equal((await h.request(null, '/api/admin/users')).status, 401);
  } finally {
    await h.mf.dispose();
  }
});

test('activity is authenticated, throttled, persists after logout and preserves profile versions', async () => {
  const h = await harness();
  try {
    const id = h.identities.alice.id;
    const read = () =>
      h.db
        .prepare('SELECT profile,profile_version,updated_at,last_seen_at FROM users WHERE id=?')
        .bind(id)
        .first<{
          profile: string;
          profile_version: number;
          updated_at: string;
          last_seen_at: string | null;
        }>();
    const before = (await read())!;
    assert.equal(before.last_seen_at, null);
    assert.equal((await h.request(null, '/api/activity', 'POST', {})).status, 401);
    assert.equal(
      (await h.request('alice', '/api/activity', 'POST', {}, { 'X-CSRF-Token': 'invalid' })).status,
      403,
    );
    assert.equal((await read())!.last_seen_at, null);
    const start = Date.now();
    assert.equal((await h.request('alice', '/api/activity', 'POST', {})).status, 200);
    const first = (await read())!;
    assert.ok(Date.parse(first.last_seen_at!) >= start);
    assert.ok(Date.parse(first.last_seen_at!) <= Date.now());
    assert.deepEqual({ ...first, last_seen_at: null }, before);
    assert.equal((await h.request('alice', '/api/me')).status, 200);
    assert.equal((await read())!.last_seen_at, first.last_seen_at);
    const old = new Date(Date.now() - 120_000).toISOString();
    await h.db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').bind(old, id).run();
    // This is the existing Mac synchronization endpoint; no new native build is needed.
    assert.equal((await h.request('alice', '/api/native/profile')).status, 200);
    const native = (await read())!;
    assert.ok(native.last_seen_at! > old);
    assert.equal((await h.request('alice', '/api/logout', 'POST', {})).status, 200);
    assert.equal((await h.request('alice', '/api/activity', 'POST', {})).status, 401);
    assert.equal((await read())!.last_seen_at, native.last_seen_at);
    assert.equal((await h.request('pending', '/api/activity', 'POST', {})).status, 200);
    await h.db
      .prepare("UPDATE users SET status='suspended' WHERE id=?")
      .bind(h.identities.bob.id)
      .run();
    assert.equal((await h.request('bob', '/api/activity', 'POST', {})).status, 403);
    assert.equal(
      (await h.db
        .prepare('SELECT last_seen_at FROM users WHERE id=?')
        .bind(h.identities.bob.id)
        .first<{ last_seen_at: string | null }>())!.last_seen_at,
      null,
    );
  } finally {
    await h.mf.dispose();
  }
});
