// A one-character miss of a portals.yml setting used to be invisible.
// `tracked_companys` is not an array under `tracked_companies`, so scan treated
// the company list as empty, printed a success receipt, and exited 0.
// validate-portals agreed: 0 errors. The file and the key were never named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'co-portal-typo-'));
const typoFile = join(dir, 'portals.yml');
const cleanFile = join(dir, 'clean.yml');
const notesFile = join(dir, 'notes.yml');

const COMPANY = `  - name: "Example Co"
    careers_url: "https://boards.example.com/example"
    enabled: true
`;

writeFileSync(typoFile, `tracked_companys:\n${COMPANY}title_fliter:\n  positive: ["analyst"]\n`);
writeFileSync(cleanFile, `tracked_companies:\n${COMPANY}`);
writeFileSync(notesFile, `notes: "a private reminder, not a setting"\ntracked_companies: []\n`);

// Scan reads the tracker, pipeline, and scan history to dedupe. Point every
// data path at the temp dir so a developer's own files never feed the run.
function run(script, args, extraEnv) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CAREER_OPS_')));
  const r = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
    env: { ...env, CAREER_OPS_ROOT: dir, ...extraEnv },
  });
  assert.equal(r.error, undefined, `${script} failed to spawn`);
  assert.equal(r.signal, null, `${script} killed by ${r.signal}`);
  return r;
}

test('scan refuses a misspelled portals.yml key and names the file, the key, and a rerun', () => {
  const r = run('scan.mjs', ['--dry-run', '--json'], { CAREER_OPS_PORTALS: typoFile });
  const err = r.stderr ?? '';
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${err}\n${r.stdout}`);
  assert.match(err, new RegExp(typoFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(err, /tracked_companys/);
  assert.match(err, /tracked_companies/);
  assert.match(err, /title_fliter/);
  assert.match(err, /title_filter/);
  assert.match(err, /node scan\.mjs --dry-run --json/);
  assert.doesNotMatch(r.stdout ?? '', /careerops\.scan\.receipt/);
});

test('scan still accepts a correctly spelled company list and an unrelated note key', () => {
  const clean = run('scan.mjs', ['--dry-run', '--json'], { CAREER_OPS_PORTALS: cleanFile });
  assert.equal(clean.status, 0, `${clean.stderr}\n${clean.stdout}`);
  assert.match(clean.stdout ?? '', /"added":0/);

  const notes = run('scan.mjs', ['--dry-run', '--json'], { CAREER_OPS_PORTALS: notesFile });
  assert.equal(notes.status, 0, `${notes.stderr}\n${notes.stdout}`);
  assert.match(notes.stdout ?? '', /careerops\.scan\.receipt/);
});

test('validate-portals reports the same misspelling as an error', () => {
  const r = run('validate-portals.mjs', ['--file', typoFile], {});
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 1, out);
  assert.match(out, /tracked_companys/);
  assert.match(out, /tracked_companies/);
  assert.match(out, new RegExp(typoFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
