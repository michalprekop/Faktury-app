import { HTTPException } from 'hono/http-exception';
import {
  nativeDatabaseSchema,
  fromNativeInvoice,
  fromNativeSettings,
  chooseTemplate,
} from '../shared/native';
import { totals, type Template, type SavedInvoice, templateSchema } from '../shared/model';
import { hash, type C } from './security';

export async function importNative(c: C, source: unknown) {
  const database = nativeDatabaseSchema.parse(source);
  const userID = c.get('user').id,
    stamp = new Date().toISOString(),
    digest = await hash(JSON.stringify(database));
  const prior = await c.env.DB.prepare(
    'SELECT source_hash,invoice_count FROM native_imports WHERE user_id=?',
  )
    .bind(userID)
    .first<{ source_hash: string; invoice_count: number }>();
  if (prior) {
    if (prior.source_hash === digest)
      return c.json({ imported: prior.invoice_count, alreadyImported: true });
    throw new HTTPException(409, {
      message: 'Účet už obsahuje import. Existujúce faktúry sa neprepísali.',
    });
  }
  const rows = await c.env.DB.prepare(
    'SELECT t.* FROM templates t JOIN template_grants g ON t.id=g.template_id WHERE g.user_id=? AND t.archived=0 ORDER BY t.id',
  )
    .bind(userID)
    .all<Record<string, unknown>>();
  const templates: Template[] = rows.results.map((r) => ({
    id: String(r.id),
    ...templateSchema.parse({
      name: r.name,
      description: r.description,
      version: r.version,
      config: JSON.parse(String(r.config)),
      archived: Boolean(r.archived),
    }),
  }));
  const defaultTemplate = chooseTemplate(templates, database.settings.invoiceTemplate);
  if (!defaultTemplate)
    throw new HTTPException(403, { message: 'Najprv musí správca priradiť pôvodnú šablónu účtu.' });
  const profile = fromNativeSettings(database.settings, database.customers, defaultTemplate.id);
  const invoices = database.invoices.map((n) => {
    const template = chooseTemplate(
      templates,
      n.templateOverride ?? database.settings.invoiceTemplate,
      defaultTemplate.id,
    );
    if (!template) throw new HTTPException(403, { message: 'Chýba priradená šablóna pre import.' });
    const invoice = fromNativeInvoice(n, 1, template.id);
    return {
      ...invoice,
      templateSnapshot: template.config,
      templateName: template.name,
      updatedAt: new Date((n.updatedAt + 978307200) * 1000).toISOString(),
    } satisfies SavedInvoice;
  });
  if (
    new Set(invoices.map((i) => i.id)).size !== invoices.length ||
    new Set(invoices.map((i) => i.number.toLowerCase())).size !== invoices.length
  )
    throw new HTTPException(400, { message: 'Záloha obsahuje duplicitné faktúry.' });
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO native_imports(user_id,source_hash,invoice_count,created_at,empty_account) SELECT ?,?,?,?,CASE WHEN profile_version=0 AND NOT EXISTS(SELECT 1 FROM invoices WHERE user_id=?) THEN 1 ELSE 0 END FROM users WHERE id=?',
      ).bind(userID, digest, invoices.length, stamp, userID, userID),
      c.env.DB.prepare('UPDATE users SET profile=?,profile_version=1,updated_at=? WHERE id=?').bind(
        JSON.stringify(profile),
        stamp,
        userID,
      ),
      ...invoices.map((i) =>
        c.env.DB.prepare(
          'INSERT INTO invoices(id,user_id,number,version,document,created_at,updated_at,total) VALUES(?,?,?,?,?,?,?,?)',
        ).bind(
          i.id,
          userID,
          i.number,
          i.version,
          JSON.stringify(i),
          new Date((i.nativeDates!.createdAt + 978307200) * 1000).toISOString(),
          i.updatedAt,
          totals(i).total,
        ),
      ),
      c.env.DB.prepare(
        'INSERT INTO audit_events(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        userID,
        'native_import',
        userID,
        JSON.stringify({
          invoices: invoices.length,
          customers: database.customers.length,
          sourceHash: digest,
        }),
        stamp,
      ),
    ]);
  } catch (error) {
    if (/CHECK|UNIQUE/.test(String(error)))
      throw new HTTPException(409, {
        message: 'Import potrebuje prázdny účet. Existujúce údaje sa neprepísali.',
      });
    throw error;
  }
  return c.json({
    imported: invoices.length,
    customers: database.customers.length,
    alreadyImported: false,
  });
}
