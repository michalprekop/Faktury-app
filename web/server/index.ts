import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { auth } from './auth';
import { api } from './api';
import { appleReady, type AppContext, type Bindings } from './security';
import { scheduledBackup } from './backups';

const app = new Hono<AppContext>();
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Strict-Transport-Security', 'max-age=31536000');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self' https://appleid.apple.com; frame-ancestors 'none'",
  );
  c.header('Cache-Control', 'no-store');
});
app.get('/api/config', (c) =>
  c.json({
    name: 'Faktúry',
    appleReady: appleReady(c.env),
    registrationOpen: c.env.REGISTRATION_OPEN === 'true',
    macAvailable: Boolean(c.env.MAC_DOWNLOAD_KEY),
  }),
);
app.get('/health', (c) =>
  c.json({ service: 'faktury', status: 'ok', login: appleReady(c.env) ? 'configured' : 'pending' }),
);
app.route('/auth', auth);
app.route('/api', api);
app.get('/download/mac', async (c) => {
  if (!c.env.MAC_DOWNLOAD_KEY) return c.notFound();
  const object = await c.env.FILES.get(c.env.MAC_DOWNLOAD_KEY);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="Faktury-Mac.zip"',
      'Content-Length': String(object.size),
    },
  });
});
app.all('/api/*', (c) => c.json({ error: 'Neznáma požiadavka.' }, 404));
app.all('/auth/*', (c) => c.notFound());
app.all('/__preview/*', (c) => c.notFound());
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return c.json(
      {
        error: error.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join(' '),
      },
      400,
    );
  console.error(
    JSON.stringify({
      event: 'request_failed',
      method: c.req.method,
      path: new URL(c.req.url).pathname,
    }),
  );
  return c.json({ error: 'Požiadavku sa nepodarilo dokončiť. Skúste to znova.' }, 500);
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledBackup(env));
  },
} satisfies ExportedHandler<Bindings>;
