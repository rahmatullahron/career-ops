// Two config tabs can each save the follow-up cadence. The second tab posts
// every knob from the copy it loaded, so a save that landed in the other tab
// is overwritten and both pages say Saved. A revision from the GET lets the
// second save stop when the file changed.
//
// Posts with no revision still save, so older clients keep working.
//
// Run: node --test tests/lib/cadence-revision.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import "../helpers/web-ts-alias-loader.mjs";

const { GET, POST } = await import("../../src/app/api/followups/cadence/route.ts");

const PROFILE = `candidate:
  full_name: Avery Quinn
followup_cadence:
  applied_first_days: 12
  applied_subsequent_days: 7
`;

function post(body) {
  return new Request("http://fixture.invalid/api/followups/cadence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withProfile(fn) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "career-ops-cadence-")));
  mkdirSync(path.join(root, "config"));
  const file = path.join(root, "config", "profile.yml");
  writeFileSync(file, PROFILE);
  writeFileSync(path.join(root, "config", "profile.example.yml"), "candidate:\n  full_name: Template Person\n");
  const saved = {
    root: process.env.CAREER_OPS_ROOT,
    profile: process.env.CAREER_OPS_PROFILE,
  };
  process.env.CAREER_OPS_ROOT = root;
  delete process.env.CAREER_OPS_PROFILE;
  try {
    await fn(file);
  } finally {
    if (saved.root === undefined) delete process.env.CAREER_OPS_ROOT;
    else process.env.CAREER_OPS_ROOT = saved.root;
    if (saved.profile === undefined) delete process.env.CAREER_OPS_PROFILE;
    else process.env.CAREER_OPS_PROFILE = saved.profile;
    rmSync(root, { recursive: true, force: true });
  }
}

test("a stale cadence revision is refused and the first save stays", async () => {
  await withProfile(async (file) => {
    const loaded = await (await GET()).json();
    assert.equal(typeof loaded.revision, "string");
    assert.equal(loaded.revision.length > 0, true);

    const saved = await POST(post({ applied_first_days: 16, revision: loaded.revision }));
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.notEqual(savedBody.revision, loaded.revision);

    const conflict = await POST(post({
      applied_first_days: 12,
      applied_max_followups: 5,
      revision: loaded.revision,
    }));
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json();
    assert.match(conflictBody.error, /another tab/);

    const written = yaml.load(readFileSync(file, "utf8"));
    assert.equal(written.followup_cadence.applied_first_days, 16);
    assert.equal(written.followup_cadence.applied_max_followups, undefined);
    assert.equal(written.candidate.full_name, "Avery Quinn");
  });
});

test("a cadence save without a revision still merges", async () => {
  await withProfile(async (file) => {
    const saved = await POST(post({ applied_max_followups: 4 }));
    assert.equal(saved.status, 200);
    const written = yaml.load(readFileSync(file, "utf8"));
    assert.equal(written.followup_cadence.applied_first_days, 12);
    assert.equal(written.followup_cadence.applied_max_followups, 4);
  });
});
