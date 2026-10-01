import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROFILE_IMAGE_BYTES } from '../shared/image-limits';
import { imageSchema, type Profile, type SavedInvoice } from '../shared/model';
import { nativeSettingsSchema, toNativeInvoice, toNativeSettings } from '../shared/native';
import { imageFile } from '../src/api';
import { harness } from './harness';

function png(bytes: number) {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
    'base64',
  );
  return (
    'data:image/png;base64,' +
    Buffer.concat([pixel, Buffer.alloc(bytes - pixel.length)]).toString('base64')
  );
}

test('image limit counts decoded bytes, including the final base64 padding', async () => {
  for (const bytes of [130_001, 499_999, 500_000]) {
    assert.equal(imageSchema.safeParse(png(bytes)).success, true);
  }
  // Both files have the same encoded length, but only one fits the binary limit.
  assert.equal(png(500_000).length, png(500_001).length);
  assert.equal(imageSchema.safeParse(png(500_001)).success, false);
  assert.equal(imageSchema.safeParse('data:image/svg+xml;base64,PHN2Zz4=').success, false);
  await assert.rejects(
    imageFile(
      new File([new Uint8Array(500_001)], 'large.png', { type: 'image/png' }),
      MAX_PROFILE_IMAGE_BYTES,
    ),
    /0,5 MB/,
  );
});

test('two 0.5 MB images persist together in web and Mac profiles and invoices', async () => {
  const h = await harness();
  try {
    const image = png(MAX_PROFILE_IMAGE_BYTES);
    const me = (await (await h.request('owner', '/api/me')).json()) as {
      profile: Profile;
      profileVersion: number;
    };
    const profile = { ...me.profile, logo: image, signature: image };
    const write = await h.request('owner', '/api/profile', 'PUT', {
      profile,
      version: me.profileVersion,
    });
    assert.equal(write.status, 200, await write.clone().text());
    const restored = (await (await h.request('owner', '/api/me')).json()) as typeof me;
    assert.deepEqual(restored.profile, profile);

    const settings = toNativeSettings(profile);
    assert.equal(nativeSettingsSchema.safeParse(settings).success, true);
    const nativeWrite = await h.request('owner', '/api/native/profile', 'PUT', {
      settings,
      customers: [],
      version: restored.profileVersion,
      templateID: profile.defaultTemplateID,
    });
    assert.equal(nativeWrite.status, 200, await nativeWrite.clone().text());
    const nativeProfile = (await (await h.request('owner', '/api/native/profile')).json()) as {
      settings: typeof settings;
      version: number;
    };
    assert.equal(nativeProfile.settings.logo, settings.logo);
    assert.equal(nativeProfile.settings.signature, settings.signature);

    const invoice = await h.invoice('owner');
    assert.equal(invoice.logo, image);
    assert.equal(invoice.signature, image);
    const savedResponse = await h.request('owner', `/api/invoices/${invoice.id}`, 'PUT', invoice);
    assert.equal(savedResponse.status, 200, await savedResponse.clone().text());
    const saved = (await savedResponse.json()) as SavedInvoice;
    const nativeInvoice = toNativeInvoice(saved);
    nativeInvoice.note = 'Úprava z Macu s veľkým logom a podpisom';
    const macWrite = await h.request('owner', `/api/native/invoices/${invoice.id}`, 'PUT', {
      invoice: nativeInvoice,
      version: saved.version,
      templateID: saved.templateID,
    });
    assert.equal(macWrite.status, 200, await macWrite.clone().text());
    const updated = (await (
      await h.request('owner', `/api/invoices/${invoice.id}`)
    ).json()) as SavedInvoice;
    assert.equal(updated.logo, image);
    assert.equal(updated.signature, image);
    assert.equal(updated.note, nativeInvoice.note);

    const oversized = png(MAX_PROFILE_IMAGE_BYTES + 1);
    assert.equal(
      (
        await h.request('owner', '/api/profile', 'PUT', {
          profile: { ...profile, logo: oversized },
          version: nativeProfile.version,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await h.request('owner', '/api/native/profile', 'PUT', {
          settings: { ...settings, signature: oversized.split(',')[1] },
          customers: [],
          version: nativeProfile.version,
          templateID: profile.defaultTemplateID,
        })
      ).status,
      400,
    );
    const afterRejected = (await (
      await h.request('owner', '/api/native/profile')
    ).json()) as typeof nativeProfile;
    assert.deepEqual(afterRejected, nativeProfile);
  } finally {
    await h.mf.dispose();
  }
});
