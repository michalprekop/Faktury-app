import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import {
  appleReady,
  appleToken,
  verifyAppleIdentity,
  token,
  hash,
  now,
  cookie,
  cookieName,
  seal,
  unseal,
  body,
  type AppContext,
} from './security';
import { z } from 'zod';
import { loginDestination } from '../shared/navigation';
import { createAccount } from './accounts';

export const auth = new Hono<AppContext>();
auth.get('/apple', async (c) => {
  if (!appleReady(c.env)) return c.redirect('/?auth=not-configured');
  const limited = await c.env.AUTH_LIMITER.limit({
    key: c.req.header('CF-Connecting-IP') ?? 'local',
  });
  if (!limited.success) throw new HTTPException(429, { message: 'Skúste sa prihlásiť o minútu.' });
  const state = token(),
    binding = token(),
    nonce = token(),
    challenge = c.req.query('desktop_challenge') ?? null;
  if (challenge && !/^[a-f0-9]{64}$/.test(challenge))
    throw new HTTPException(400, { message: 'Neplatná požiadavka aplikácie.' });
  await c.env.DB.prepare(
    'INSERT INTO oauth_states(state_hash,binding_hash,nonce,expires_at,desktop_challenge) VALUES(?,?,?,?,?)',
  )
    .bind(await hash(state), await hash(binding), nonce, now() + 600, challenge)
    .run();
  cookie(c, 'oauth', binding, 600, 'None');
  cookie(c, 'oauth_return', loginDestination(c.req.query('return_to')), 600, 'None');
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.search = new URLSearchParams({
    client_id: c.env.APPLE_CLIENT_ID,
    redirect_uri: c.env.APP_ORIGIN + '/auth/apple/callback',
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce,
  }).toString();
  return c.redirect(url.toString());
});
auth.post('/apple/callback', async (c) => {
  const destination = loginDestination(getCookie(c, cookieName(c.env, 'oauth_return')));
  cookie(c, 'oauth_return', '', 0, 'None');
  try {
    if (!appleReady(c.env)) return c.redirect('/?auth=not-configured');
    // Callback is cross-site by design. Bound one-time state replaces the normal API CSRF check.
    const declared = Number(c.req.header('Content-Length'));
    if (declared > 16384) throw new Error('Oversized callback');
    const reader = c.req.raw.body?.getReader();
    if (!reader) throw new Error('Missing callback');
    let size = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new Error('Oversized callback');
      }
      parts.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      data.set(p, offset);
      offset += p.length;
    }
    const form = new URLSearchParams(new TextDecoder().decode(data));
    const state = form.get('state') ?? '',
      binding = getCookie(c, cookieName(c.env, 'oauth')) ?? '';
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(binding))
      throw new Error('Missing state');
    const record = await c.env.DB.prepare(
      'DELETE FROM oauth_states WHERE state_hash = ? AND binding_hash = ? AND expires_at > ? RETURNING nonce,desktop_challenge',
    )
      .bind(await hash(state), await hash(binding), now())
      .first<{ nonce: string; desktop_challenge: string | null }>();
    cookie(c, 'oauth', '', 0, 'None');
    if (!record || !form.get('code') || form.has('error')) throw new Error('Invalid state');
    const result = await appleToken(c.env, {
      grant_type: 'authorization_code',
      code: form.get('code')!,
      redirect_uri: c.env.APP_ORIGIN + '/auth/apple/callback',
    });
    if (!result.id_token || !result.refresh_token) throw new Error('Invalid Apple response');
    const identity = await verifyAppleIdentity(result.id_token, c.env, record.nonce);
    let user = await c.env.DB.prepare('SELECT id,status FROM users WHERE apple_sub = ?')
      .bind(identity.sub!)
      .first<{ id: string; status: string }>();
    if (!user) {
      if (c.env.REGISTRATION_OPEN !== 'true') return c.redirect('/?auth=closed');
      if (
        typeof identity.email !== 'string' ||
        !['true', true].includes(identity.email_verified as boolean)
      )
        throw new Error('Unverified email');
      let name = '';
      try {
        const info = JSON.parse(form.get('user') ?? '{}');
        name = [info.name?.firstName, info.name?.lastName]
          .filter((v) => typeof v === 'string')
          .join(' ')
          .slice(0, 200);
      } catch {}
      await createAccount(c.env.DB, {
        subject: identity.sub!,
        email: identity.email.slice(0, 320),
        name,
      });
      user = await c.env.DB.prepare('SELECT id,status FROM users WHERE apple_sub = ?')
        .bind(identity.sub!)
        .first<{ id: string; status: string }>();
    }
    if (!user || user.status === 'suspended') return c.redirect('/?auth=suspended');
    const session = token();
    await c.env.DB.prepare(
      'INSERT INTO sessions(token_hash,user_id,csrf,expires_at,apple_refresh,checked_at,created_at) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(
        await hash(session),
        user.id,
        token(),
        now() + 30 * 86_400,
        await seal(result.refresh_token, c.env),
        now(),
        now(),
      )
      .run();
    if (record.desktop_challenge) {
      const code = token();
      await c.env.DB.prepare('INSERT INTO desktop_handoffs VALUES(?,?,?,?)')
        .bind(await hash(code), record.desktop_challenge, await seal(session, c.env), now() + 120)
        .run();
      return c.redirect('sk.faktury.desktop://auth?code=' + code);
    }
    cookie(c, 'session', session, 30 * 86_400);
    return c.redirect(destination);
  } catch {
    // Never log the auth code, identity token, refresh token, or callback form.
    console.warn(JSON.stringify({ event: 'apple_login_failed' }));
    cookie(c, 'oauth', '', 0, 'None');
    return c.redirect('/?auth=failed');
  }
});
auth.post('/desktop/exchange', async (c) => {
  const input = z
    .object({
      code: z.string().regex(/^[a-f0-9]{64}$/),
      verifier: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(await body(c, 2048));
  const record = await c.env.DB.prepare(
    'DELETE FROM desktop_handoffs WHERE code_hash=? AND challenge=? AND expires_at>? RETURNING session_encrypted',
  )
    .bind(await hash(input.code), await hash(input.verifier), now())
    .first<{ session_encrypted: string }>();
  if (!record) throw new HTTPException(401, { message: 'Prihlásenie aplikácie vypršalo.' });
  const session = await unseal(record.session_encrypted, c.env);
  cookie(c, 'session', session, 30 * 86_400);
  return c.json({ ok: true });
});
