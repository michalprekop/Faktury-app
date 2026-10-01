import { importNative } from './native-import';
import { IMAGE_REQUEST_BYTES } from '../shared/image-limits';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { authenticate, body, cookie, type AppContext, type C } from './security';
import {
  invoiceSchema,
  profileSchema,
  templateSchema,
  emptyProfile,
  totals,
  type SavedInvoice,
  type Template,
  type TemplateConfig,
  type AdminUser,
} from '../shared/model';
import { backupAccount, exportAccount, scheduledBackup } from './backups';
import {
  nativeInvoiceSchema,
  nativeSettingsSchema,
  fromNativeInvoice,
  fromNativeSettings,
  toNativeInvoice,
  toNativeSettings,
} from '../shared/native';
import { companySchema, type Invoice, type Profile } from '../shared/model';

export const api = new Hono<AppContext>();
function fail(status: 400 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
const audit = (c: C, action: string, target: string, details: object = {}) =>
  c.env.DB.prepare(
    'INSERT INTO audit_events(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)',
  ).bind(
    crypto.randomUUID(),
    c.get('user').id,
    action,
    target,
    JSON.stringify(details),
    new Date().toISOString(),
  );
const unpackTemplate = (row: Record<string, unknown>): Template => ({
  id: String(row.id),
  name: String(row.name),
  description: String(row.description),
  version: Number(row.version),
  archived: Boolean(row.archived),
  config: JSON.parse(String(row.config)),
});
async function allowedTemplate(c: C, id: string) {
  const row = await c.env.DB.prepare(
    'SELECT t.* FROM templates t JOIN template_grants g ON g.template_id=t.id WHERE g.user_id=? AND t.id=? AND t.archived=0',
  )
    .bind(c.get('user').id, id)
    .first<Record<string, unknown>>();
  return row ? unpackTemplate(row) : null;
}
api.use('*', async (c, next) => {
  await authenticate(c);
  await next();
});
api.get('/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT profile,profile_version FROM users WHERE id=?')
    .bind(c.get('user').id)
    .first<{ profile: string; profile_version: number }>();
  return c.json({
    user: c.get('user'),
    csrf: c.get('session').csrf,
    profile: { ...emptyProfile(), ...JSON.parse(row!.profile) },
    profileVersion: row!.profile_version,
  });
});
// Visible web sessions report presence; native sessions already poll the same API.
api.post('/activity', (c) => c.json({ ok: true }));
api.post('/logout', async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
    .bind(c.get('session').token_hash)
    .run();
  cookie(c, 'session', '', 0);
  return c.json({ ok: true });
});
api.use('*', async (c, next) => {
  if (c.get('user').status !== 'active') fail(403, 'Účet čaká na aktiváciu správcom.');
  await next();
});
api.post('/native/import', async (c) => importNative(c, await body(c, 25_000_000)));
api.get('/native/profile', async (c) => {
  const row = await c.env.DB.prepare('SELECT profile,profile_version FROM users WHERE id=?')
    .bind(c.get('user').id)
    .first<{ profile: string; profile_version: number }>();
  const p = profileSchema.parse({ ...emptyProfile(), ...JSON.parse(row!.profile) });
  return c.json({
    settings: toNativeSettings(p),
    customers: p.customers ?? [],
    version: row!.profile_version,
    defaultTemplateID: p.defaultTemplateID,
  });
});
api.put('/native/profile', async (c) => {
  const input = z
    .object({
      settings: nativeSettingsSchema,
      customers: z.array(companySchema.extend({ id: z.string().uuid() })).max(5000),
      version: z.number().int().nonnegative(),
      templateID: z.string().nullable(),
    })
    .strict()
    .parse(await body(c, IMAGE_REQUEST_BYTES));
  return saveProfile(c, {
    profile: fromNativeSettings(input.settings, input.customers, input.templateID),
    version: input.version,
  });
});
api.get('/native/invoices/:id', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT document,deleted_at FROM invoices WHERE user_id=? AND id=?',
  )
    .bind(c.get('user').id, c.req.param('id').toLowerCase())
    .first<{ document: string; deleted_at: string | null }>();
  if (!row || row.deleted_at) fail(404, 'Faktúra sa nenašla.');
  const saved = JSON.parse(row.document) as SavedInvoice;
  return c.json({
    invoice: toNativeInvoice(saved),
    version: saved.version,
    template: { id: saved.templateID, name: saved.templateName, config: saved.templateSnapshot },
  });
});
api.put('/native/invoices/:id', async (c) => {
  const input = z
    .object({
      invoice: nativeInvoiceSchema,
      version: z.number().int().nonnegative(),
      templateID: z.string().min(1).max(64),
    })
    .strict()
    .parse(await body(c, IMAGE_REQUEST_BYTES));
  return saveInvoice(c, fromNativeInvoice(input.invoice, input.version, input.templateID));
});
api.put('/profile', async (c) => {
  const input = z
    .object({ profile: profileSchema, version: z.number().int().nonnegative() })
    .strict()
    .parse(await body(c, IMAGE_REQUEST_BYTES));
  return saveProfile(c, input);
});
async function saveProfile(c: C, input: { profile: Profile; version: number }) {
  if (
    input.profile.defaultTemplateID &&
    !(await allowedTemplate(c, input.profile.defaultTemplateID))
  )
    fail(403, 'Táto šablóna nie je priradená vášmu účtu.');
  const result = await c.env.DB.prepare(
    'UPDATE users SET profile=?,profile_version=profile_version+1,updated_at=? WHERE id=? AND profile_version=?',
  )
    .bind(JSON.stringify(input.profile), new Date().toISOString(), c.get('user').id, input.version)
    .run();
  if (!result.meta.changes)
    fail(409, 'Profil sa medzičasom zmenil na inom zariadení. Obnovte stránku.');
  return c.json({ version: input.version + 1 });
}
api.get('/templates', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT t.* FROM templates t JOIN template_grants g ON g.template_id=t.id WHERE g.user_id=? AND t.archived=0 ORDER BY t.name',
  )
    .bind(c.get('user').id)
    .all<Record<string, unknown>>();
  return c.json(rows.results.map(unpackTemplate));
});
api.get('/invoices', async (c) => {
  const offset = Math.max(0, Math.min(1000000, Number(c.req.query('offset')) || 0));
  const trash = c.req.query('trash') === '1';
  const rows = await c.env.DB.prepare(
    `SELECT id,number,version,updated_at,deleted_at,json_extract(document,'$.customer.name') AS customer,json_extract(document,'$.currency') AS currency,json_extract(document,'$.paid') AS paid,json_extract(document,'$.dueDate') AS dueDate,json_extract(document,'$.issueDate') AS issueDate,coalesce(json_extract(document,'$.items'),'') || coalesce(json_extract(document,'$.note'),'') || coalesce(json_extract(document,'$.customer'),'') AS searchText,total FROM invoices WHERE user_id=? AND deleted_at IS ${trash ? 'NOT ' : ''}NULL ORDER BY updated_at DESC,id LIMIT 100 OFFSET ?`,
  )
    .bind(c.get('user').id, offset)
    .all();
  return c.json({
    items: rows.results,
    nextOffset: rows.results.length === 100 ? offset + 100 : null,
  });
});
api.get('/next-number', async (c) => {
  const row = await c.env.DB.prepare('SELECT profile FROM users WHERE id=?')
    .bind(c.get('user').id)
    .first<{ profile: string }>();
  const profile = { ...emptyProfile(), ...JSON.parse(row!.profile) };
  const prefix = profile.numberPrefix + new Date().getUTCFullYear();
  const numbers = await c.env.DB.prepare(
    'SELECT number FROM invoices WHERE user_id=? AND substr(number,1,?)=?',
  )
    .bind(c.get('user').id, prefix.length, prefix)
    .all<{ number: string }>();
  const max = numbers.results.reduce((m, r) => {
    const s = r.number.slice(prefix.length);
    return /^\d{1,10}$/.test(s) ? Math.max(m, Number(s)) : m;
  }, 0);
  return c.json({ number: prefix + String(max + 1).padStart(profile.numberDigits, '0') });
});
api.get('/invoices/:id', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT document,deleted_at FROM invoices WHERE user_id=? AND id=?',
  )
    .bind(c.get('user').id, c.req.param('id').toLowerCase())
    .first<{ document: string; deleted_at: string | null }>();
  if (!row) fail(404, 'Faktúra sa nenašla.');
  return c.json({ ...JSON.parse(row.document), deletedAt: row.deleted_at });
});
api.put('/invoices/:id', async (c) =>
  saveInvoice(c, invoiceSchema.parse(await body(c, IMAGE_REQUEST_BYTES))),
);
async function saveInvoice(c: C, input: Invoice) {
  if (input.id !== (c.req.param('id') ?? '').toLowerCase())
    fail(400, 'Nesúhlasí identifikátor faktúry.');
  const userID = c.get('user').id;
  const existing = await c.env.DB.prepare(
    'SELECT document,version,deleted_at FROM invoices WHERE user_id=? AND id=?',
  )
    .bind(userID, input.id)
    .first<{ document: string; version: number; deleted_at: string | null }>();
  if (existing?.deleted_at) fail(409, 'Najprv obnovte faktúru z koša.');
  if ((existing?.version ?? 0) !== input.version)
    fail(
      409,
      'Faktúra sa medzičasom zmenila. Vaše zmeny zostali vo formulári; otvorte aktuálnu verziu v novej karte a porovnajte ich.',
    );
  const prior = existing ? (JSON.parse(existing.document) as SavedInvoice) : null;
  const template = await allowedTemplate(c, input.templateID);
  // A revoked template remains part of an existing invoice's historical snapshot only.
  if (!template && prior?.templateID !== input.templateID)
    fail(403, 'Táto šablóna nie je priradená vášmu účtu.');
  const saved: SavedInvoice = {
    ...input,
    version: input.version + 1,
    updatedAt: new Date().toISOString(),
    templateSnapshot:
      prior?.templateID === input.templateID ? prior.templateSnapshot : template!.config,
    templateName: prior?.templateID === input.templateID ? prior.templateName : template!.name,
  };
  try {
    if (existing) {
      const result = await c.env.DB.prepare(
        'UPDATE invoices SET number=?,document=?,version=?,updated_at=?,total=? WHERE user_id=? AND id=? AND version=? AND deleted_at IS NULL',
      )
        .bind(
          saved.number,
          JSON.stringify(saved),
          saved.version,
          saved.updatedAt,
          totals(saved).total,
          userID,
          input.id,
          input.version,
        )
        .run();
      if (!result.meta.changes)
        fail(409, 'Faktúru zmenilo iné zariadenie. Obnovte aktuálnu verziu.');
    } else {
      await c.env.DB.prepare(
        'INSERT INTO invoices(id,user_id,number,version,document,created_at,updated_at,total) VALUES(?,?,?,?,?,?,?,?)',
      )
        .bind(
          saved.id,
          userID,
          saved.number,
          saved.version,
          JSON.stringify(saved),
          saved.updatedAt,
          saved.updatedAt,
          totals(saved).total,
        )
        .run();
    }
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    if (String(error).includes('UNIQUE'))
      fail(409, 'Číslo faktúry už existuje, aj medzi vymazanými faktúrami. Zvoľte iné číslo.');
    throw error;
  }
  return c.json(saved);
}
api.post('/invoices/:id/trash', async (c) => {
  const input = z
    .object({ version: z.number().int().positive(), restore: z.boolean() })
    .strict()
    .parse(await body(c));
  const stamp = new Date().toISOString();
  const result = await c.env.DB.prepare(
    'UPDATE invoices SET deleted_at=?,updated_at=?,version=version+1,document=json_set(document,"$.version",version+1,"$.updatedAt",?) WHERE user_id=? AND id=? AND version=?',
  )
    .bind(
      input.restore ? null : stamp,
      stamp,
      stamp,
      c.get('user').id,
      c.req.param('id').toLowerCase(),
      input.version,
    )
    .run();
  if (!result.meta.changes) fail(409, 'Faktúra už neexistuje alebo sa zmenila.');
  return c.json({ ok: true });
});
api.get('/invoices/:id/versions', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT version,created_at FROM invoice_versions WHERE user_id=? AND invoice_id=? ORDER BY version DESC LIMIT 100',
  )
    .bind(c.get('user').id, c.req.param('id').toLowerCase())
    .all();
  return c.json(rows.results);
});
api.get('/invoices/:id/versions/:version', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT document FROM invoice_versions WHERE user_id=? AND invoice_id=? AND version=?',
  )
    .bind(c.get('user').id, c.req.param('id').toLowerCase(), Number(c.req.param('version')) || 0)
    .first<{ document: string }>();
  if (!row) fail(404, 'Verzia sa nenašla.');
  return c.json(JSON.parse(row.document));
});
api.get(
  '/export',
  (c) =>
    new Response(exportAccount(c.env, c.get('user').id), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="INVOY-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    }),
);
api.get('/backups', async (c) => {
  const list = await c.env.FILES.list({ prefix: `backups/${c.get('user').id}/`, limit: 1000 });
  return c.json(
    list.objects
      .map((x) => ({
        day: x.key.split('/').pop()!.replace('.json', ''),
        size: x.size,
        createdAt: x.uploaded.toISOString(),
      }))
      .sort((a, b) => b.day.localeCompare(a.day)),
  );
});
api.post('/backups', async (c) => {
  const day = new Date().toISOString().slice(0, 10);
  await backupAccount(c.env, c.get('user').id, day);
  return c.json({ day });
});
api.get('/backups/:day', async (c) => {
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(c.req.param('day'));
  const object = await c.env.FILES.get(`backups/${c.get('user').id}/${day}.json`);
  if (!object) fail(404, 'Záloha sa nenašla.');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="INVOY-${day}.json"`,
    },
  });
});

api.use('/admin/*', async (c, next) => {
  if (c.get('user').role !== 'admin') fail(403, 'Táto časť je dostupná iba správcovi.');
  await next();
});
api.post('/admin/backup', async (c) => {
  const limit = await c.env.AUTH_LIMITER.limit({ key: 'backup:' + c.get('user').id });
  if (!limit.success) throw new HTTPException(429, { message: 'Ďalšiu zálohu spustite o minútu.' });
  await scheduledBackup(c.env);
  return c.json({ ok: true });
});
api.get('/admin/users', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,u.last_seen_at,
      (SELECT COUNT(*) FROM invoices i WHERE i.user_id=u.id) AS invoice_count,
      COALESCE(json_array_length(u.profile, '$.customers'), 0) AS customer_count
     FROM users u ORDER BY u.created_at DESC LIMIT 1000`,
  ).all<AdminUser>();
  const grants = await c.env.DB.prepare('SELECT user_id,template_id FROM template_grants').all();
  const backup = await c.env.DB.prepare(
    'SELECT * FROM backup_runs ORDER BY day DESC LIMIT 1',
  ).first();
  return c.json({ users: rows.results, grants: grants.results, backup });
});
api.put('/admin/users/:id', async (c) => {
  const input = z
    .object({
      status: z.enum(['pending', 'active', 'suspended']),
      templates: z.array(z.string().min(1).max(64)).max(50),
    })
    .strict()
    .parse(await body(c, 8192));
  const id = c.req.param('id'),
    user = await c.env.DB.prepare('SELECT role FROM users WHERE id=?')
      .bind(id)
      .first<{ role: string }>();
  if (!user) fail(404, 'Používateľ sa nenašiel.');
  if (user.role === 'admin' && input.status !== 'active')
    fail(400, 'Správcovský účet nemožno týmto formulárom pozastaviť.');
  const ids = [...new Set(input.templates)];
  for (const templateID of ids) {
    const row = await c.env.DB.prepare('SELECT id FROM templates WHERE id=? AND archived=0')
      .bind(templateID)
      .first();
    if (!row) fail(400, 'Vyberte iba dostupné šablóny.');
  }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').bind(
      input.status,
      new Date().toISOString(),
      id,
    ),
    c.env.DB.prepare('DELETE FROM template_grants WHERE user_id=?').bind(id),
    ...ids.map((t) =>
      c.env.DB.prepare('INSERT INTO template_grants(user_id,template_id) VALUES(?,?)').bind(id, t),
    ),
    ...(input.status === 'suspended'
      ? [c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]
      : []),
    audit(c, 'account_permissions', id, { status: input.status, templates: ids }),
  ]);
  return c.json({ ok: true });
});
api.get('/admin/templates', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM templates ORDER BY name').all<
    Record<string, unknown>
  >();
  return c.json(rows.results.map(unpackTemplate));
});
api.put('/admin/templates/:id', async (c) => {
  const id = z
    .string()
    .regex(/^[a-zA-Z0-9-]{1,64}$/)
    .parse(c.req.param('id'));
  const input = templateSchema.parse(await body(c));
  const stamp = new Date().toISOString();
  const prior = await c.env.DB.prepare('SELECT version FROM templates WHERE id=?')
    .bind(id)
    .first<{ version: number }>();
  if ((prior?.version ?? 0) !== input.version)
    fail(409, 'Šablóna sa medzičasom zmenila. Obnovte stránku.');
  const statement = prior
    ? c.env.DB.prepare(
        'UPDATE templates SET name=?,description=?,config=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=?',
      ).bind(
        input.name,
        input.description,
        JSON.stringify(input.config),
        Number(input.archived),
        stamp,
        id,
        input.version,
      )
    : c.env.DB.prepare(
        'INSERT INTO templates(id,name,description,config,archived,version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)',
      ).bind(
        id,
        input.name,
        input.description,
        JSON.stringify(input.config),
        Number(input.archived),
        stamp,
        stamp,
      );
  const event = c.env.DB.prepare(
    'INSERT INTO audit_events(id,actor_id,action,target_id,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0',
  ).bind(
    crypto.randomUUID(),
    c.get('user').id,
    'template_saved',
    id,
    JSON.stringify({ version: input.version + 1, archived: input.archived }),
    stamp,
  );
  const result = await c.env.DB.batch([statement, event]);
  if (!result[0].meta.changes) fail(409, 'Šablónu zmenil iný správca.');
  return c.json({ ...input, id, version: input.version + 1 });
});
api.get('/admin/audit', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT action,target_id,details,created_at FROM audit_events ORDER BY created_at DESC LIMIT 100',
  ).all();
  return c.json(rows.results);
});
