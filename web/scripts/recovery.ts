import { z } from 'zod';
import {
  emptyProfile,
  profileSchema,
  invoiceSchema,
  templateConfigSchema,
  templateSchema,
  invoiceInput,
  totals,
} from '../shared/model';
const sql = (value: unknown) =>
  value === null || value === undefined
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replace(/'/g, "''") + "'";
const userSchema = z.object({
  id: z.string().uuid(),
  apple_sub: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  status: z.enum(['active', 'pending', 'suspended']),
  created_at: z.string(),
  updated_at: z.string(),
});
export function recoverySQL(control: unknown, accounts: Record<string, unknown>): string {
  const c = z
    .object({
      format: z.literal('faktury-control-1'),
      users: z.array(userSchema),
      templates: z.array(z.any()),
      grants: z.array(z.object({ user_id: z.string().uuid(), template_id: z.string() })),
      audit: z.array(z.any()),
    })
    .parse(control);
  const statements = [
    '-- Apply only to a NEW replacement D1 database after applying schema migrations.',
    'CREATE TABLE recovery_guard(empty INTEGER CHECK(empty=1));',
    'INSERT INTO recovery_guard SELECT CASE WHEN (SELECT count(*) FROM users)=0 THEN 1 ELSE 0 END;',
  ];
  for (const row of c.templates) {
    const t = templateSchema.parse({
      name: row.name,
      description: row.description,
      version: row.version,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      archived: Boolean(row.archived),
    });
    statements.push(
      `INSERT INTO templates(id,name,description,version,config,archived,created_at,updated_at) VALUES(${[row.id, t.name, t.description, t.version, JSON.stringify(t.config), Number(t.archived), row.created_at, row.updated_at].map(sql).join(',')}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,version=excluded.version,config=excluded.config,archived=excluded.archived,updated_at=excluded.updated_at;`,
    );
  }
  for (const user of c.users) {
    const a = z
      .object({
        format: z.literal('faktury-web-1'),
        profile: z.unknown(),
        profileVersion: z.number().int().nonnegative(),
        invoices: z.array(
          z.object({
            id: z.string().uuid(),
            document: z.any(),
            version: z.number().int().positive(),
            deleted_at: z.string().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        ),
      })
      .parse(accounts[user.id]);
    const profile = profileSchema.parse({ ...emptyProfile(), ...(a.profile as object) });
    statements.push(
      `INSERT INTO users(id,apple_sub,email,name,role,status,profile,profile_version,created_at,updated_at) VALUES(${[user.id, user.apple_sub, user.email, user.name, user.role, user.status, JSON.stringify(profile), a.profileVersion, user.created_at, user.updated_at].map(sql).join(',')});`,
    );
    for (const row of a.invoices) {
      const input = invoiceSchema.parse(invoiceInput(row.document));
      if (input.id !== row.id || input.version !== row.version)
        throw new Error('Invalid invoice identity/version in backup');
      const document = {
        ...input,
        templateSnapshot: templateConfigSchema.parse(row.document.templateSnapshot),
        templateName: z.string().max(80).parse(row.document.templateName),
        updatedAt: row.updated_at,
      };
      statements.push(
        `INSERT INTO invoices(id,user_id,number,version,document,deleted_at,created_at,updated_at,total) VALUES(${[row.id, user.id, input.number, row.version, JSON.stringify(document), row.deleted_at, row.created_at, row.updated_at, totals(input).total].map(sql).join(',')});`,
      );
    }
  }
  for (const grant of c.grants)
    statements.push(
      `INSERT INTO template_grants(user_id,template_id) VALUES(${sql(grant.user_id)},${sql(grant.template_id)});`,
    );
  statements.push('DROP TABLE recovery_guard;');
  return statements.join('\n');
}
