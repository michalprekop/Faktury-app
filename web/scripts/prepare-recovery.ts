// Offline operator utility. Never uploads data or modifies a remote database.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { recoverySQL } from './recovery';
const [controlFile, accountDirectory, output] = process.argv.slice(2);
if (!controlFile || !accountDirectory || !output)
  throw new Error(
    'Usage: npx tsx scripts/prepare-recovery.ts control.json account-backups-directory output.sql',
  );
const control = JSON.parse(await readFile(controlFile, 'utf8')),
  accounts: Record<string, unknown> = {};
for (const user of control.users) {
  if (!/^[a-f0-9-]{36}$/i.test(user.id)) throw new Error('Invalid account ID');
  accounts[user.id] = JSON.parse(await readFile(join(accountDirectory, user.id + '.json'), 'utf8'));
}
await writeFile(output, recoverySQL(control, accounts), { mode: 0o600, flag: 'wx' });
console.log(
  'Recovery SQL prepared. Review and apply only to a NEW empty database with migrations already applied.',
);
