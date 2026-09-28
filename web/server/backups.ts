import type { Bindings } from './security';

export function exportAccount(env: Bindings, userID: string): ReadableStream<Uint8Array> {
  async function* chunks() {
    const user = await env.DB.prepare('SELECT profile,profile_version FROM users WHERE id = ?')
      .bind(userID)
      .first<{ profile: string; profile_version: number }>();
    if (!user) throw new Error('Account not found');
    const templates = await env.DB.prepare(
      'SELECT t.* FROM templates t JOIN template_grants g ON g.template_id=t.id WHERE g.user_id=?',
    )
      .bind(userID)
      .all();
    yield JSON.stringify({
      format: 'faktury-web-1',
      exportedAt: new Date().toISOString(),
      profile: JSON.parse(user.profile),
      profileVersion: user.profile_version,
      templates: templates.results,
    }).slice(0, -1) + ',"invoices":[';
    let cursor = '',
      first = true;
    for (;;) {
      const page = await env.DB.prepare(
        'SELECT id,document,version,deleted_at,created_at,updated_at FROM invoices WHERE user_id=? AND id>? ORDER BY id LIMIT 10',
      )
        .bind(userID, cursor)
        .all<{
          id: string;
          document: string;
          version: number;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        }>();
      for (const row of page.results) {
        yield (first ? '' : ',') + JSON.stringify({ ...row, document: JSON.parse(row.document) });
        first = false;
        cursor = row.id;
      }
      if (page.results.length < 10) break;
    }
    yield ']}';
  }
  const iterator = chunks();
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) controller.close();
        else controller.enqueue(encoder.encode(result.value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
export async function backupAccount(env: Bindings, id: string, day: string) {
  const key = `backups/${id}/${day}.json`;
  // Multipart accepts unknown-length streams without buffering the entire account.
  const upload = await env.FILES.createMultipartUpload(key, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { account: id, format: 'faktury-web-1' },
  });
  const reader = exportAccount(env, id).getReader(),
    parts: R2UploadedPart[] = [];
  const buffer = new Uint8Array(5 * 1024 * 1024);
  let used = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length;) {
        const length = Math.min(buffer.length - used, value.length - offset);
        buffer.set(value.subarray(offset, offset + length), used);
        used += length;
        offset += length;
        if (used === buffer.length) {
          parts.push(await upload.uploadPart(parts.length + 1, buffer));
          used = 0;
        }
      }
    }
    if (used) parts.push(await upload.uploadPart(parts.length + 1, buffer.slice(0, used)));
    await upload.complete(parts);
  } catch (error) {
    await upload.abort();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return key;
}
export async function scheduledBackup(env: Bindings) {
  const day = new Date().toISOString().slice(0, 10);
  let accounts = 0,
    cursor = '';
  await env.DB.prepare(
    "INSERT INTO backup_runs(day,status) VALUES(?,'running') ON CONFLICT(day) DO UPDATE SET status='running',completed_at=NULL",
  )
    .bind(day)
    .run();
  try {
    for (;;) {
      const page = await env.DB.prepare('SELECT id FROM users WHERE id>? ORDER BY id LIMIT 20')
        .bind(cursor)
        .all<{ id: string }>();
      for (const user of page.results) {
        await backupAccount(env, user.id, day);
        cursor = user.id;
        accounts++;
      }
      if (page.results.length < 20) break;
    }
    // Back up the control plane separately. This prefix has no public/API download route.
    const control = await env.DB.batch([
      env.DB.prepare('SELECT id,apple_sub,email,name,role,status,created_at,updated_at FROM users'),
      env.DB.prepare('SELECT * FROM templates'),
      env.DB.prepare('SELECT * FROM template_grants'),
      env.DB.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 10000'),
    ]);
    await env.FILES.put(
      `control/${day}.json`,
      JSON.stringify({
        format: 'faktury-control-1',
        users: control[0].results,
        templates: control[1].results,
        grants: control[2].results,
        audit: control[3].results,
      }),
      { httpMetadata: { contentType: 'application/json' } },
    );
    await env.DB.prepare(
      "UPDATE backup_runs SET status='complete',accounts=?,completed_at=? WHERE day=?",
    )
      .bind(accounts, new Date().toISOString(), day)
      .run();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(
        Math.floor(Date.now() / 1000),
      ),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(
        Math.floor(Date.now() / 1000),
      ),
      env.DB.prepare('DELETE FROM desktop_handoffs WHERE expires_at < ?').bind(
        Math.floor(Date.now() / 1000),
      ),
    ]);
    console.log(JSON.stringify({ event: 'backup_complete', accounts, day }));
  } catch (error) {
    await env.DB.prepare("UPDATE backup_runs SET status='failed',accounts=? WHERE day=?")
      .bind(accounts, day)
      .run();
    console.error(JSON.stringify({ event: 'backup_failed', day }));
    throw error;
  }
}
