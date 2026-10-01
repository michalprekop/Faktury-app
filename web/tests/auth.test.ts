import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';
import { hash, seal } from '../server/security';
import { appleLoginPath, loginDestination } from '../shared/navigation';
const encryption = 'a1'.repeat(32);
test('admin sign-in keeps its local destination and rejects external return URLs', async () => {
  const h = await harness('https://invoy.example.test', {
    APPLE_CLIENT_ID: 'test.web',
    APPLE_KEY_ID: 'TEST',
    APPLE_TEAM_ID: 'TEST',
    APPLE_PRIVATE_KEY: 'not-a-real-key',
    TOKEN_ENCRYPTION_KEY: encryption,
  });
  try {
    assert.equal(appleLoginPath('/admin42'), '/auth/apple?return_to=/admin42');
    assert.equal(appleLoginPath('/'), '/auth/apple');
    for (const destination of [
      '/admin42',
      'https://evil.example',
      '//evil.example',
      '/api/admin/users',
    ]) {
      const expected = destination === '/admin42' ? '/admin42' : '/';
      assert.equal(loginDestination(destination), expected);
      const response = await h.request(
        null,
        '/auth/apple?return_to=' + encodeURIComponent(destination),
      );
      assert.equal(response.status, 302);
      const cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-faktury_oauth_return='));
      assert.ok(cookie);
      assert.equal(decodeURIComponent(cookie.split(';')[0].split('=')[1]), expected);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /Secure/);
      assert.match(cookie, /SameSite=None/);
    }
  } finally {
    await h.mf.dispose();
  }
});
test('Apple OAuth is browser-bound, expires and never grants admin to a caller', async () => {
  const h = await harness('https://faktury.example.test', {
    APPLE_CLIENT_ID: 'test.web',
    APPLE_KEY_ID: 'TEST',
    APPLE_TEAM_ID: 'TEST',
    APPLE_PRIVATE_KEY: 'not-a-real-key',
    TOKEN_ENCRYPTION_KEY: encryption,
    REGISTRATION_OPEN: 'true',
  });
  try {
    const start = await h.request(null, '/auth/apple');
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get('Location')!);
    assert.equal(location.origin, 'https://appleid.apple.com');
    assert.equal(
      location.searchParams.get('redirect_uri'),
      'https://faktury.example.test/auth/apple/callback',
    );
    assert.equal(location.searchParams.get('response_type'), 'code');
    const cookie = start.headers.get('Set-Cookie')!;
    assert.match(cookie, /__Host-faktury_oauth=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=None/);
    const state = location.searchParams.get('state')!;
    const res = await h.mf.dispatchFetch('https://faktury.example.test/auth/apple/callback', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: '__Host-faktury_oauth=' + '00'.repeat(32),
      },
      body: new URLSearchParams({ state, code: 'forged' }).toString(),
    });
    assert.equal(res.headers.get('Location'), '/?auth=failed');
    assert.match(
      res.headers.getSetCookie().find((value) => value.startsWith('__Host-faktury_oauth_return='))!,
      /Max-Age=0/,
    );
    assert.ok(!res.headers.get('Set-Cookie')?.includes('faktury_session'));
    assert.equal((await h.db.prepare('SELECT count(*) n FROM users').first<{ n: number }>())!.n, 4);
    const row = await h.db
      .prepare('SELECT expires_at FROM oauth_states WHERE state_hash=?')
      .bind(await hash(state))
      .first<{ expires_at: number }>();
    assert.ok(row!.expires_at <= Math.floor(Date.now() / 1000) + 600);
  } finally {
    await h.mf.dispose();
  }
});
test('Mac login handoff requires matching verifier and is single-use and expiring', async () => {
  const h = await harness(undefined, { TOKEN_ENCRYPTION_KEY: encryption });
  try {
    const code = 'ab'.repeat(32),
      verifier = 'cd'.repeat(32);
    await h.db
      .prepare('INSERT INTO desktop_handoffs VALUES(?,?,?,?)')
      .bind(
        await hash(code),
        await hash(verifier),
        await seal(h.identities.alice.token, { TOKEN_ENCRYPTION_KEY: encryption } as never),
        Math.floor(Date.now() / 1000) + 120,
      )
      .run();
    assert.equal(
      (await h.request(null, '/auth/desktop/exchange', 'POST', { code, verifier: 'ef'.repeat(32) }))
        .status,
      401,
    );
    const response = await h.request(null, '/auth/desktop/exchange', 'POST', { code, verifier });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Set-Cookie')!, /HttpOnly/);
    assert.equal(
      (await h.request(null, '/auth/desktop/exchange', 'POST', { code, verifier })).status,
      401,
    );
    await h.db
      .prepare('INSERT INTO desktop_handoffs VALUES(?,?,?,?)')
      .bind(await hash(code), await hash(verifier), 'unreadable-expired', 1)
      .run();
    assert.equal(
      (await h.request(null, '/auth/desktop/exchange', 'POST', { code, verifier })).status,
      401,
    );
  } finally {
    await h.mf.dispose();
  }
});
