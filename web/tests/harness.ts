import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { emptyProfile, freshInvoice } from '../shared/model';
export async function harness(
  origin = 'http://127.0.0.1:8791',
  overrides: Record<string, string> = {},
) {
  await mkdir('.wrangler', { recursive: true });
  await build({
    entryPoints: ['server/index.ts'],
    outfile: '.wrangler/test-worker.mjs',
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'],
    logLevel: 'silent',
  });
  const mf = new Miniflare({
    workers: [
      {
        name: 'faktury',
        modules: true,
        scriptPath: '.wrangler/test-worker.mjs',
        compatibilityDate: '2026-08-01',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['FILES'],
        ratelimits: { AUTH_LIMITER: { namespace_id: 'test', simple: { limit: 100, period: 60 } } },
        bindings: {
          APP_ORIGIN: origin,
          APPLE_CLIENT_ID: '',
          APPLE_TEAM_ID: '',
          APPLE_KEY_ID: '',
          REGISTRATION_OPEN: 'false',
          MAC_DOWNLOAD_KEY: '',
          ...overrides,
        },
        assets: {
          workerName: 'faktury',
          directory: 'dist',
          binding: 'ASSETS',
          routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
          assetConfig: { not_found_handling: 'single-page-application' },
        },
      },
    ],
  });
  const db = await mf.getD1Database('DB');
  // D1 exec expects a complete statement per line; triggers must remain intact.
  for (const name of (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = await readFile('migrations/' + name, 'utf8');
    await db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  }
  const identities: Record<string, { id: string; token: string; csrf: string }> = {};
  for (const [key, role, status] of [
    ['owner', 'admin', 'active'],
    ['alice', 'user', 'active'],
    ['bob', 'user', 'active'],
    ['pending', 'user', 'pending'],
  ] as const) {
    const id = crypto.randomUUID(),
      session = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex'),
      stamp = new Date().toISOString(),
      now = Math.floor(Date.now() / 1000);
    const profile = emptyProfile();
    profile.supplier.name = key === 'owner' ? 'Ukážkové štúdio' : `Firma ${key}`;
    profile.supplier.street = 'Ukážková 12';
    profile.supplier.city = 'Bratislava';
    profile.supplier.postalCode = '811 01';
    profile.defaultTemplateID = 'classic';
    profile.accounts = [
      {
        id: crypto.randomUUID(),
        name: 'Ukážkový účet',
        iban: 'SK9611000000002918599669',
        swift: 'TATRSKBX',
        holderName: profile.supplier.name,
      },
    ];
    profile.defaultAccountID = profile.accounts[0].id;
    await db
      .prepare(
        'INSERT INTO users(id,apple_sub,email,name,role,status,profile,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        'test-' + key,
        key + '@example.test',
        key === 'owner' ? 'Ukážkový správca' : key,
        role,
        status,
        JSON.stringify(profile),
        stamp,
        stamp,
      )
      .run();
    await db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)')
      .bind(
        createHash('sha256').update(session).digest('hex'),
        id,
        csrf,
        now + 3600,
        'test-only-unused',
        now,
        now,
      )
      .run();
    await db.prepare('INSERT INTO template_grants VALUES(?,?)').bind(id, 'classic').run();
    if (key === 'owner')
      await db.prepare('INSERT INTO template_grants VALUES(?,?)').bind(id, 'mono').run();
    identities[key] = { id, token: session, csrf };
  }
  const request = (
    who: string | null,
    path: string,
    method = 'GET',
    data?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const identity = who ? identities[who] : null;
    return mf.dispatchFetch(origin + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(identity
          ? { Cookie: `faktury_session=${identity.token}`, 'X-CSRF-Token': identity.csrf }
          : {}),
        'Content-Type': 'application/json',
        Origin: origin,
        ...headers,
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  };
  async function invoice(who: string, number = '2026001') {
    const response = await request(who, '/api/me');
    const { profile } = (await response.json()) as { profile: ReturnType<typeof emptyProfile> };
    const document = freshInvoice(profile, number, 'classic');
    document.customer.name = `Klient ${who}`;
    document.items[0].name = 'Grafické práce';
    document.items[0].unitPrice = '1250';
    return document;
  }
  return { mf, db, identities, request, invoice };
}
