import { emptyProfile } from '../shared/model';

/** Registration always starts with this account's empty profile, never a template or another user. */
export async function createAccount(
  db: D1Database,
  identity: { subject: string; email: string; name: string },
) {
  const stamp = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO users(id,apple_sub,email,name,profile,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(apple_sub) DO NOTHING',
    )
    .bind(
      crypto.randomUUID(),
      identity.subject,
      identity.email,
      identity.name,
      JSON.stringify(emptyProfile()),
      stamp,
      stamp,
    )
    .run();
}
