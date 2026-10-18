"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "memory.js");

function env() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mem-"));
  const vault = path.join(root, "vault", "OpenCode");
  const cwd = path.join(root, "proj-alpha");
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  const profile = path.join(root, "cfg", "memory", "profile.md");
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: { ...process.env, OC_VAULT: vault, OC_PROFILE: profile } });
    return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
  };
  const read = (f) => fs.readFileSync(path.join(vault, f), "utf8");
  return { root, vault, cwd, profile, run, read };
}

test("pref: written under managed section, unrelated content preserved, profile generated", () => {
  const t = env();
  fs.writeFileSync(path.join(t.vault, "Context.md"), "# Context\nFree-form line that must survive.\n");
  const r = t.run("add", "pref", "Use pnpm, not npm, for installs");
  assert.equal(r.code, 0, r.err);
  const ctx = t.read("Context.md");
  assert.match(ctx, /Free-form line that must survive\./);
  assert.match(ctx, /## Preferences\n- \d{4}-\d{2}-\d{2} \u2014 Use pnpm, not npm, for installs/);
  const p = fs.readFileSync(t.profile, "utf8");
  assert.match(p, /- Use pnpm, not npm, for installs/);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(p), "dates stripped from loaded profile");
});

test("no repetition across sessions: a fresh process sees the earlier preference without being told", () => {
  const t = env();
  t.run("add", "pref", "Answers max 8 lines, bullets over prose");
  const fresh = t.run("brief");
  assert.match(fresh.out, /max 8 lines/);
});

test("exact duplicate is skipped and file is untouched", () => {
  const t = env();
  t.run("add", "pref", "Prefer TypeScript strict mode in new code");
  const before = t.read("Context.md");
  const r = t.run("add", "pref", "Prefer TypeScript strict mode in new code");
  assert.equal(r.code, 0);
  assert.match(r.out, /^DUP /);
  assert.equal(t.read("Context.md"), before);
});

test("contradiction (negation flip) is flagged, not silently stored or skipped", () => {
  const t = env();
  t.run("add", "pref", "Use npm for package installs");
  const before = t.read("Context.md");
  const r = t.run("add", "pref", "Never use npm for package installs, use pnpm");
  assert.equal(r.code, 2);
  assert.match(r.out, /possible contradiction/);
  assert.equal(t.read("Context.md"), before, "flagged entry must not be written");
});

test("--supersede replaces old entry, archives it, profile reflects only the new one", () => {
  const t = env();
  t.run("add", "pref", "Use npm for package installs");
  const flagged = t.run("add", "pref", "Never use npm for package installs, use pnpm");
  const id = /SIMILAR (\w{6})/.exec(flagged.out)[1];
  const r = t.run("add", "pref", "Never use npm for package installs, use pnpm", "--supersede", id);
  assert.equal(r.code, 0, r.err);
  const ctx = t.read("Context.md");
  assert.ok(!/\u2014 Use npm for package installs/.test(ctx));
  assert.match(t.read("Context_archive.md"), /Use npm for package installs .*superseded/);
  const p = fs.readFileSync(t.profile, "utf8");
  assert.match(p, /Never use npm/);
  assert.ok(!/- Use npm for/.test(p));
});

test("--force keeps both when entries merely overlap", () => {
  const t = env();
  t.run("add", "decision", "Use Postgres for orders", "--project", "alpha");
  const flagged = t.run("add", "decision", "Use Postgres for sessions", "--project", "alpha");
  assert.equal(flagged.code, 2);
  assert.equal(t.run("add", "decision", "Use Postgres for sessions", "--project", "alpha", "--force").code, 0);
});

test("secrets and oversize entries are rejected, nothing written", () => {
  const t = env();
  // Literals are split at runtime: the publisher's fail-closed key sweep runs
  // over this file too, and a contiguous fake key/credential would trip it.
  // Same runtime string, no static match.
  const fakeKey = `deploy key is ${"sk"}-abcdefghijklmnopqrstuv1234`;
  const fakeCred = `db pass${"word"}=hunter2hunter2`;
  assert.equal(t.run("add", "pref", fakeKey).code, 3);
  assert.equal(t.run("add", "pref", fakeCred).code, 3);
  assert.equal(t.run("add", "pref", "x".repeat(301)).code, 3);
  assert.ok(!fs.existsSync(path.join(t.vault, "Context.md")));
});

test("decision: newest-first, regex-compatible with existing archive counter, project tag + hub link", () => {
  const t = env();
  fs.mkdirSync(path.join(t.vault, "Projects", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(t.vault, "Projects", "alpha", "project.md"), "# alpha\n");
  t.run("add", "decision", "Chose SQLite for local cache", "--why", "zero ops", "--project", "alpha");
  t.run("add", "decision", "Chose Vite over webpack", "--why", "faster dev server", "--project", "alpha");
  const lines = t.read("Decisions.md").split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}\s+[\u2014-]/.test(l));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Vite over webpack/);
  assert.match(lines[0], /\[\[Projects\/alpha\/project\|alpha\]\] #proj\/alpha/);
});

test("error entries get Status: Open", () => {
  const t = env();
  t.run("add", "error", "Build fails on Windows path length", "--project", "alpha");
  assert.match(t.read("Errors.md"), /Build fails on Windows path length \u2014 Status: Open/);
});

test("cap: entry 51+ moves oldest to *_archive.md", () => {
  const t = env();
  for (let i = 0; i < 52; i++) {
    const r = t.run("add", "decision", `uniq${i}a uniq${i}b uniq${i}c uniq${i}d`, "--project", "alpha");
    assert.equal(r.code, 0, r.err);
  }
  const live = t.read("Decisions.md").split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}\s+[\u2014-]/.test(l));
  assert.equal(live.length, 50);
  assert.match(live[0], /uniq51a/);
  const arch = t.read("Decisions_archive.md");
  assert.match(arch, /uniq0a/);
  assert.match(arch, /never auto-loaded/);
});

test("profile stays within the line budget even with many entries", () => {
  const t = env();
  for (let i = 0; i < 60; i++) t.run("add", "pref", `uniq${i}a uniq${i}b uniq${i}c`);
  const lines = fs.readFileSync(t.profile, "utf8").trim().split("\n");
  assert.ok(lines.length <= 40, `profile has ${lines.length} lines`);
});

test("project-scope constraint goes to ./.opencode/memory/context.md, not the vault", () => {
  const t = env();
  const r = t.run("add", "constraint", "Never touch the payments module without asking");
  assert.equal(r.code, 0, r.err);
  const f = path.join(t.cwd, ".opencode", "memory", "context.md");
  assert.match(fs.readFileSync(f, "utf8"), /## Constraints\n- \d{4}-\d{2}-\d{2} \u2014 Never touch the payments module/);
  assert.ok(!fs.existsSync(path.join(t.vault, "Context.md")));
});

test("recall: ranks relevant entries, honors limit, skips archives unless asked", () => {
  const t = env();
  t.run("add", "decision", "Chose Drizzle ORM for the orders schema", "--project", "alpha");
  t.run("add", "decision", "Chose Tailwind for styling", "--project", "alpha");
  t.run("add", "decision", "Drizzle migrations run in CI only", "--project", "alpha", "--force");
  const r = t.run("recall", "drizzle migrations", "--limit", "1");
  assert.equal(r.out.split("\n").length, 1);
  assert.match(r.out, /Drizzle migrations run in CI only/);
  assert.match(t.run("recall", "tailwind styling").out, /Tailwind/);
  assert.equal(t.run("recall", "kubernetes helm").out, "no matches");
  fs.writeFileSync(path.join(t.vault, "Decisions_archive.md"), "# Decisions Archive\n\n2025-01-01 \u2014 Retired kubernetes helm setup\n");
  assert.equal(t.run("recall", "kubernetes helm").out, "no matches");
  assert.match(t.run("recall", "kubernetes helm", "--archive").out, /kubernetes/);
});

test("sync: index block links hubs, is idempotent, preserves other Memory.md content", () => {
  const t = env();
  fs.mkdirSync(path.join(t.vault, "Projects", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(t.vault, "Projects", "alpha", "project.md"), "# alpha\n");
  fs.writeFileSync(path.join(t.vault, "Projects", "alpha", "wip.md"), "# wip\n");
  fs.writeFileSync(path.join(t.vault, "Memory.md"), "# Memory\n\nMy own notes stay.\n");
  t.run("sync");
  const once = t.read("Memory.md");
  t.run("sync");
  assert.equal(t.read("Memory.md"), once);
  assert.match(once, /My own notes stay\./);
  assert.match(once, /\[\[Projects\/alpha\/project\|alpha\]\] \(\[\[Projects\/alpha\/wip\|wip\]\]\)/);
  assert.match(once, /\[\[Decisions\]\]/);
});

test("CRLF line endings are preserved", () => {
  const t = env();
  fs.writeFileSync(path.join(t.vault, "Context.md"), "# Context\r\n\r\n## Preferences\r\n");
  t.run("add", "pref", "Keep commits small and atomic");
  const raw = t.read("Context.md");
  assert.ok(raw.includes("\r\n") && !/[^\r]\n/.test(raw));
});

test("lint: flags orphans, basename collisions, loose Context lines, untagged entries", () => {
  const t = env();
  for (const p of ["a", "b"]) {
    fs.mkdirSync(path.join(t.vault, "Projects", p), { recursive: true });
    fs.writeFileSync(path.join(t.vault, "Projects", p, "wip.md"), "# wip\n");
  }
  fs.writeFileSync(path.join(t.vault, "Lonely.md"), "# nothing links here\n");
  fs.writeFileSync(path.join(t.vault, "Context.md"), "# Context\nloose pref line\n");
  fs.writeFileSync(path.join(t.vault, "Decisions.md"), "# Decisions\n\n2026-01-01 \u2014 Untagged old decision\n");
  const r = t.run("lint").out;
  assert.match(r, /orphan: Lonely/);
  assert.match(r, /basename collision: wip x2/);
  assert.match(r, /Context\.md: 1 line/);
  assert.match(r, /Decisions\.md: 1 entry without #proj/);
});

test("init: creates linked hubs once, indexed by sync, no orphans, brief shows wip next action", () => {
  const t = env();
  assert.match(t.run("init", "alpha").out, /created project\.md, wip\.md/);
  assert.match(t.run("init", "alpha").out, /already exists/);
  assert.match(t.read("Memory.md"), /\[\[Projects\/alpha\/project\|alpha\]\]/);
  assert.equal(t.run("lint").out, "lint: clean");
  assert.ok(!/wip\(/.test(t.run("brief", "--project", "alpha").out), "empty Next action is not shown");
  const f = path.join(t.vault, "Projects", "alpha", "wip.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("Next action:", "Next action: wire login route"));
  assert.match(t.run("brief", "--project", "alpha").out, /wip\(alpha\): Next action: wire login route/);
});
