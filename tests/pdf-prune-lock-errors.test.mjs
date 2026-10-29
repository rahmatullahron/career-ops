import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquirePipelineLock } from '../pipeline-lock.mjs';
import { syncTrackerPdfFlags } from '../sync-pdf-flags.mjs';

for (const json of [true, false]) {
  test(`prune reports a held manifest lock without throwing (json=${json})`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'pdf-prune-timeout-'));
    const tracker = join(root, 'applications.md');
    const manifest = join(root, 'pdf-index.tsv');
    writeFileSync(tracker, '# tracker\n');
    writeFileSync(manifest, '# manifest\n');
    const held = await acquirePipelineLock(manifest);
    const messages = [];
    try {
      const code = await syncTrackerPdfFlags({
        appsFile: tracker, pdfManifest: manifest,
        flags: { prune: true, write: true, json },
        lock: { timeoutMs: 30, maxWaitMs: 30, retryMs: 5 },
        logger: { log: message => messages.push(message), error: message => messages.push(message) },
      });
      assert.equal(code, 4);
      assert.equal(messages.length, 1);
      if (json) assert.equal(JSON.parse(messages[0]).code, 'lock-timeout');
      else assert.match(messages[0], /pipeline lock timeout/);
      assert.equal(readFileSync(manifest, 'utf8'), '# manifest\n');
      assert.equal(readFileSync(tracker, 'utf8'), '# tracker\n');
    } finally {
      held.release();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('prune reports an inaccessible manifest lock through its JSON contract', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pdf-prune-lock-error-'));
  try {
    const tracker = join(root, 'applications.md');
    const parent = join(root, 'not-a-directory');
    writeFileSync(tracker, '# tracker\n');
    writeFileSync(parent, 'unchanged');
    const messages = [];
    const code = await syncTrackerPdfFlags({
      appsFile: tracker, pdfManifest: join(parent, 'pdf-index.tsv'),
      flags: { prune: true, write: true, json: true },
      lock: { timeoutMs: 30, maxWaitMs: 30, retryMs: 5 },
      logger: { log: message => messages.push(message), error: message => messages.push(message) },
    });
    assert.equal(code, 1);
    assert.equal(messages.length, 1);
    assert.equal(JSON.parse(messages[0]).code, 'lock-error');
    assert.equal(readFileSync(parent, 'utf8'), 'unchanged');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
