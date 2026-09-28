import { readFile, writeFile } from 'node:fs/promises';
import { nativeDatabaseSchema, fromNativeInvoice, fromNativeSettings } from '../shared/native';
import { totals } from '../shared/model';
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw Error('Usage: prepare-native-import.ts database.json output.json');
const db = nativeDatabaseSchema.parse(JSON.parse(await readFile(source, 'utf8')));
fromNativeSettings(db.settings, db.customers, 'mono');
const invoices = db.invoices.map((n) => fromNativeInvoice(n, 1, 'mono'));
await writeFile(destination, JSON.stringify(db), { mode: 0o600 });
console.log(
  JSON.stringify({
    invoices: invoices.length,
    customers: db.customers.length,
    total: invoices.reduce((n, i) => n + Number(totals(i).total), 0),
    imageBytesPreserved: true,
  }),
);
