import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness';

test('INVOY canonical domain preserves paths and legacy Mac API boundaries', async () => {
  const h = await harness('https://invoy.xyz');
  try {
    const request = (url: string) => h.mf.dispatchFetch(url, { redirect: 'manual' });
    const config = await request('https://invoy.xyz/api/config');
    assert.equal(config.status, 200);
    assert.equal(((await config.json()) as { name: string }).name, 'INVOY');
    for (const host of ['www.invoy.xyz', 'faktury-app.freetransfer-online.workers.dev']) {
      const response = await request(`https://${host}/privacy.html?from=old`);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('Location'), 'https://invoy.xyz/privacy.html?from=old');
    }
    const old = 'https://faktury-app.freetransfer-online.workers.dev';
    assert.equal((await request(old + '/api/me')).status, 401);
    const headers = {
      Cookie: `__Host-faktury_session=${h.identities.alice.token}`,
      'X-CSRF-Token': h.identities.alice.csrf,
    };
    assert.equal(
      (await h.mf.dispatchFetch(old + '/api/me', { headers, redirect: 'manual' })).status,
      200,
    );
    const wrongOrigin = await h.mf.dispatchFetch(old + '/api/logout', {
      method: 'POST',
      redirect: 'manual',
      headers: { ...headers, Origin: 'https://invoy.xyz' },
    });
    assert.equal(wrongOrigin.status, 403);
    const logout = await h.mf.dispatchFetch(old + '/api/logout', {
      method: 'POST',
      redirect: 'manual',
      headers: { ...headers, Origin: old },
    });
    assert.equal(logout.status, 200);
    assert.equal((await request('https://invoy.xyz/__preview/login')).status, 404);
  } finally {
    await h.mf.dispose();
  }
});
