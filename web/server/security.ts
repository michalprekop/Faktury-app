import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie } from 'hono/cookie';
import type { User } from '../shared/model';
import { timingSafeEqual } from 'node:crypto';

export type Bindings = { [K in keyof Env]: Env[K] extends string ? string : Env[K] } & {
  APPLE_PRIVATE_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
};
export type Session = {
  token_hash: string;
  user_id: string;
  csrf: string;
  expires_at: number;
  apple_refresh: string;
  checked_at: number;
};
export type AppContext = { Bindings: Bindings; Variables: { user: User; session: Session } };
export type C = Context<AppContext>;
export const now = () => Math.floor(Date.now() / 1000);
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
export async function hash(v: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
export async function equal(a: string, b: string) {
  return timingSafeEqual(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a))),
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b))),
  );
}
export function requireOrigin(c: C) {
  if (c.req.header('Origin') !== c.env.APP_ORIGIN)
    throw new HTTPException(403, { message: 'Požiadavka nepochádza z tejto aplikácie.' });
}
export function cookieName(env: Bindings, name: string) {
  return `${env.APP_ORIGIN.startsWith('https://') ? '__Host-' : ''}faktury_${name}`;
}
export function cookie(
  c: C,
  name: string,
  value: string,
  maxAge: number,
  sameSite: 'Lax' | 'None' = 'Lax',
) {
  setCookie(c, cookieName(c.env, name), value, {
    httpOnly: true,
    secure: c.env.APP_ORIGIN.startsWith('https://'),
    sameSite,
    path: '/',
    maxAge,
  });
}
export function appleReady(env: Bindings) {
  return Boolean(
    env.APPLE_CLIENT_ID &&
    env.APPLE_KEY_ID &&
    env.APPLE_TEAM_ID &&
    env.APPLE_PRIVATE_KEY &&
    env.TOKEN_ENCRYPTION_KEY,
  );
}
async function encryptionKey(env: Bindings) {
  if (!env.TOKEN_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/.test(env.TOKEN_ENCRYPTION_KEY))
    throw new Error('Encryption configuration missing');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(env.TOKEN_ENCRYPTION_KEY.match(/../g)!, (x) => parseInt(x, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(value: string, env: Bindings) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(env),
      new TextEncoder().encode(value),
    ),
  );
  return btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...bytes));
}
export async function unseal(value: string, env: Bindings) {
  const [iv, data] = value.split('.').map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), data),
  );
}
export async function appleSecret(env: Bindings) {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}
export async function appleToken(env: Bindings, params: Record<string, string>) {
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: await appleSecret(env),
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json()) as {
    error?: string;
    id_token?: string;
    refresh_token?: string;
  };
  if (!response.ok && result.error !== 'invalid_grant')
    throw new HTTPException(503, {
      message: 'Apple prihlásenie je dočasne nedostupné. Skúste to neskôr.',
    });
  return result;
}
export async function verifyAppleIdentity(jwt: string, env: Bindings, nonce?: string) {
  const keys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), {
    timeoutDuration: 10_000,
  });
  const { payload } = await jwtVerify(jwt, keys, {
    issuer: 'https://appleid.apple.com',
    audience: env.APPLE_CLIENT_ID,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat'],
    clockTolerance: 5,
  });
  if (
    !payload.sub ||
    typeof payload.sub !== 'string' ||
    (nonce && (typeof payload.nonce !== 'string' || !(await equal(payload.nonce, nonce))))
  )
    throw new HTTPException(401, { message: 'Apple prihlásenie sa nepodarilo overiť.' });
  return payload;
}
export async function authenticate(c: C) {
  const raw = getCookie(c, cookieName(c.env, 'session'));
  if (!raw || !/^[a-f0-9]{64}$/.test(raw))
    throw new HTTPException(401, { message: 'Prihláste sa do svojho účtu.' });
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(await hash(raw), now())
    .first<Session>();
  if (!session)
    throw new HTTPException(401, { message: 'Prihlásenie vypršalo. Prihláste sa znova.' });
  const user = await c.env.DB.prepare(
    'SELECT id,name,email,role,status,created_at FROM users WHERE id = ?',
  )
    .bind(session.user_id)
    .first<User>();
  if (!user || user.status === 'suspended')
    throw new HTTPException(403, { message: 'Prístup k účtu bol pozastavený.' });
  // Recheck Apple credential revocation at most once per day, never trusting browser claims.
  if (now() - session.checked_at > 86_400) {
    const result = await appleToken(c.env, {
      grant_type: 'refresh_token',
      refresh_token: await unseal(session.apple_refresh, c.env),
    });
    if (result.error === 'invalid_grant') {
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(session.token_hash)
        .run();
      throw new HTTPException(401, {
        message: 'Apple prihlásenie už nie je platné. Prihláste sa znova.',
      });
    }
    if (!result.id_token)
      throw new HTTPException(503, { message: 'Apple prihlásenie sa nepodarilo overiť.' });
    const identity = await verifyAppleIdentity(result.id_token, c.env);
    const owner = await c.env.DB.prepare('SELECT apple_sub FROM users WHERE id = ?')
      .bind(user.id)
      .first<{ apple_sub: string }>();
    if (identity.sub !== owner?.apple_sub)
      throw new HTTPException(401, { message: 'Nesúhlasí identita účtu.' });
    await c.env.DB.prepare('UPDATE sessions SET checked_at = ? WHERE token_hash = ?')
      .bind(now(), session.token_hash)
      .run();
  }
  c.set('user', user);
  c.set('session', session);
  if (!['GET', 'HEAD'].includes(c.req.method)) {
    requireOrigin(c);
    if (!(await equal(c.req.header('X-CSRF-Token') ?? '', session.csrf)))
      throw new HTTPException(403, { message: 'Neplatné potvrdenie požiadavky. Obnovte stránku.' });
  }
}
export async function body(c: C, limit = 700_000): Promise<unknown> {
  if (!c.req.header('Content-Type')?.startsWith('application/json'))
    throw new HTTPException(415, { message: 'Očakáva sa JSON.' });
  const stream = c.req.raw.body;
  if (!stream) throw new HTTPException(400, { message: 'Chýbajú údaje.' });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HTTPException(413, { message: 'Príliš veľa údajov. Zmenšite obrázky.' });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HTTPException(400, { message: 'Neplatné údaje.' });
  }
}
