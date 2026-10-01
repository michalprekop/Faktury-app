import test from 'node:test';
import assert from 'node:assert/strict';
import { assetVersion, hasNewAssets, reloadAfterSaving } from '../src/appUpdates';

test('detects CSS-only releases as well as JavaScript releases', () => {
  const origin = 'https://invoy.xyz';
  const current = assetVersion(['/assets/app-a.js', '/assets/app-a.css'], origin);
  assert.equal(
    hasNewAssets(current, assetVersion(['/assets/app-a.js', '/assets/app-b.css'], origin)),
    true,
  );
  assert.equal(
    hasNewAssets(current, assetVersion(['/assets/app-b.js', '/assets/app-a.css'], origin)),
    true,
  );
  assert.equal(
    hasNewAssets(
      current,
      assetVersion([origin + '/assets/app-a.css', '/assets/app-a.js', '/favicon.svg'], origin),
    ),
    false,
  );
  assert.equal(
    hasNewAssets(current, assetVersion(['https://other.test/assets/app.js'], origin)),
    false,
  );
  assert.equal(hasNewAssets(current, ''), false);
});

test('does not reload before a pending save finishes', async () => {
  let finish!: (saved: boolean) => void;
  let reloaded = false;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const update = reloadAfterSaving(
    () => pending,
    () => {
      reloaded = true;
    },
  );
  await Promise.resolve();
  assert.equal(reloaded, false);
  finish(true);
  assert.equal(await update, true);
  assert.equal(reloaded, true);
});

test('invalid or failed saves leave the current editor open', async () => {
  let reloaded = false;
  const reload = () => {
    reloaded = true;
  };
  assert.equal(await reloadAfterSaving(async () => false, reload), false);
  await assert.rejects(
    reloadAfterSaving(async () => {
      throw new Error('offline');
    }, reload),
  );
  assert.equal(reloaded, false);
});

test('a form opened while saving prevents reload and losing the form draft', async () => {
  let dialogOpen = false;
  let reloaded = false;
  const result = await reloadAfterSaving(
    async () => {
      dialogOpen = true;
      return true;
    },
    () => {
      reloaded = true;
    },
    () => !dialogOpen,
  );
  assert.equal(result, false);
  assert.equal(reloaded, false);
});
