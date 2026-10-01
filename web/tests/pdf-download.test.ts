import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfFilename, savePDF } from '../src/pdf-download';

test('PDF filenames preserve invoice numbers without path separators', () => {
  assert.equal(pdfFilename('2026/001: A'), 'Faktura-2026_001__A.pdf');
  assert.equal(pdfFilename('Ž-2026_001'), 'Faktura-Ž-2026_001.pdf');
});

test('PDF is written and closed only in the chosen destination', async () => {
  const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  const actions: string[] = [];
  await savePDF(blob, 'Faktura-1.pdf', {
    async createWritable() {
      return {
        async write(data) {
          assert.equal(data, blob);
          actions.push('write');
        },
        async close() {
          actions.push('close');
        },
        async abort() {
          actions.push('abort');
        },
      };
    },
  });
  assert.deepEqual(actions, ['write', 'close']);
});

for (const phase of ['write', 'close']) {
  test(`failed PDF ${phase} aborts the file transaction and reports the error`, async () => {
    const error = Error('Disk is full');
    let aborted = false;
    await assert.rejects(
      savePDF(new Blob(['PDF']), 'invoice.pdf', {
        async createWritable() {
          return {
            async write() {
              if (phase === 'write') throw error;
            },
            async close() {
              if (phase === 'close') throw error;
            },
            async abort() {
              aborted = true;
            },
          };
        },
      }),
      error,
    );
    assert.equal(aborted, true);
  });
}
