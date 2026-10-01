import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createAccount } from '../server/accounts';
import { emptyProfile, freshInvoice, type Profile } from '../shared/model';
import { toNativeSettings, type NativeSettings } from '../shared/native';
import { harness } from './harness';

test('new accounts have no logo or signature on web and Mac; uploads stay with their owner', async () => {
  const h = await harness();
  try {
    const owner = (await (await h.request('owner', '/api/me')).json()) as {
      profile: Profile;
      profileVersion: number;
    };
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    owner.profile.logo = image;
    owner.profile.signature = image;
    assert.equal(
      (
        await h.request('owner', '/api/profile', 'PUT', {
          profile: owner.profile,
          version: owner.profileVersion,
        })
      ).status,
      200,
    );

    const identity = { subject: 'new-apple-account', email: 'new@example.test', name: 'New user' };
    await createAccount(h.db, identity);
    const row = await h.db
      .prepare('SELECT id,profile,profile_version,status FROM users WHERE apple_sub=?')
      .bind(identity.subject)
      .first<{ id: string; profile: string; profile_version: number; status: string }>();
    assert.ok(row);
    assert.deepEqual(JSON.parse(row.profile), emptyProfile());
    assert.equal(row.status, 'pending');
    assert.equal(row.profile_version, 0);

    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    await h.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)')
      .bind(
        createHash('sha256').update(token).digest('hex'),
        row.id,
        csrf,
        now + 3600,
        'test-only',
        now,
        now,
      )
      .run();
    h.identities.newcomer = { id: row.id, token, csrf };
    const me = (await (await h.request('newcomer', '/api/me')).json()) as { profile: Profile };
    assert.equal(me.profile.logo, '');
    assert.equal(me.profile.signature, '');
    // Activating/granting a design must not copy the administrator's images.
    assert.equal(
      (
        await h.request('owner', `/api/admin/users/${row.id}`, 'PUT', {
          status: 'active',
          templates: ['classic', 'manolo-bay'],
        })
      ).status,
      200,
    );
    const native = (await (await h.request('newcomer', '/api/native/profile')).json()) as {
      settings: NativeSettings;
      version: number;
    };
    assert.equal(native.settings.logo, undefined);
    assert.equal(native.settings.signature, undefined);
    const invoice = freshInvoice(me.profile, '2026001', 'classic');
    assert.equal(invoice.logo, '');
    assert.equal(invoice.signature, '');

    // Old tab/session cannot write the owner's profile into the new account.
    assert.equal(
      (
        await h.request(
          'newcomer',
          '/api/profile',
          'PUT',
          {
            profile: owner.profile,
            version: 0,
          },
          { 'X-CSRF-Token': h.identities.owner.csrf },
        )
      ).status,
      403,
    );
    const ownProfile = {
      ...me.profile,
      supplier: { ...me.profile.supplier, name: 'New company' },
      logo: image,
    };
    assert.equal(
      (
        await h.request('newcomer', '/api/native/profile', 'PUT', {
          settings: toNativeSettings(ownProfile),
          customers: [],
          version: native.version,
          templateID: null,
        })
      ).status,
      200,
    );
    // A repeated Apple callback must preserve their own upload.
    await createAccount(h.db, identity);
    const after = (await (await h.request('newcomer', '/api/me')).json()) as { profile: Profile };
    assert.equal(after.profile.logo, image);
    assert.equal(after.profile.signature, '');
    const unchangedOwner = (await (await h.request('owner', '/api/me')).json()) as {
      profile: Profile;
    };
    assert.deepEqual(unchangedOwner.profile, owner.profile);
  } finally {
    await h.mf.dispose();
  }
});
