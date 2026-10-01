import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';
import { scheduledBackup } from '../server/backups';
import { recoverySQL } from '../scripts/recovery';
test('scheduled R2 snapshots restore account identities, templates and invoice contents in an empty replacement database', async () => {
  const h = await harness();
  try {
    const input = await h.invoice('alice');
    input.note = "Client's invoice — zachovať diakritiku";
    assert.equal((await h.request('alice', `/api/invoices/${input.id}`, 'PUT', input)).status, 200);
    const bucket = (await h.mf.getR2Bucket('FILES')) as unknown as R2Bucket;
    await scheduledBackup({ DB: h.db, FILES: bucket } as never);
    const day = new Date().toISOString().slice(0, 10);
    const control = (await (await bucket.get(`control/${day}.json`))!.json()) as {
      users: { id: string; last_seen_at?: string | null }[];
    };
    const lastSeen = control.users.find((u) => u.id === h.identities.alice.id)!.last_seen_at;
    assert.ok(lastSeen);
    // Backups created before activity tracking did not include this field.
    delete control.users.find((u) => u.id === h.identities.pending.id)!.last_seen_at;
    const accounts: Record<string, unknown> = {};
    for (const user of control.users)
      accounts[user.id] = await (await bucket.get(`backups/${user.id}/${day}.json`))!.json();
    const sql = recoverySQL(control, accounts);
    assert.ok(!sql.includes('apple_refresh'));
    assert.ok(!sql.includes('test-only-unused'));
    // Disposal is not a restoration test: use a separate empty database in the same isolated workerd.
    await assert.rejects(h.db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))); // refuses a populated database
    await h.db.exec(
      'DROP TABLE IF EXISTS recovery_guard; DELETE FROM sessions; DELETE FROM invoice_versions; DELETE FROM invoices; DELETE FROM template_grants; DELETE FROM users;',
    );
    await h.db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '));
    const restored = await h.db
      .prepare('SELECT document FROM invoices WHERE user_id=? AND id=?')
      .bind(h.identities.alice.id, input.id)
      .first<{ document: string }>();
    assert.equal(JSON.parse(restored!.document).note, input.note);
    assert.equal(
      (await h.db
        .prepare('SELECT last_seen_at FROM users WHERE id=?')
        .bind(h.identities.alice.id)
        .first<{ last_seen_at: string }>())!.last_seen_at,
      lastSeen,
    );
    assert.equal(
      (await h.db
        .prepare('SELECT last_seen_at FROM users WHERE id=?')
        .bind(h.identities.pending.id)
        .first<{ last_seen_at: string | null }>())!.last_seen_at,
      null,
    );
    assert.equal(
      (await h.db.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>())!.n,
      4,
    );
    assert.equal(
      (await h.db.prepare('SELECT count(*) AS n FROM sessions').first<{ n: number }>())!.n,
      0,
    );
  } finally {
    await h.mf.dispose();
  }
});
