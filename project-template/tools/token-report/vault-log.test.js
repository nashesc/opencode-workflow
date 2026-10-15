const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendReport, resolveVaultPath, readEntries } = require("./vault-log");

const REPORT = { sessionID: "ses_abc", messageID: "msg_def", model: "openai/gpt-5", total: 1234,
  vaultFields: { input: 800, output: 300, reasoning: 100, cacheRead: 30, cacheWrite: 4 } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "token-report-"));

test("creates header + prepends newest-first", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  appendReport(REPORT, p);
  appendReport({ ...REPORT, messageID: "msg_2", total: 10, vaultFields: { input: 5, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0 } }, p);
  const entries = readEntries(p);
  assert.equal(entries.length, 2);
  assert.ok(entries[0].includes("msg_2"), "newest first");
  assert.ok(entries[0].match(/^\d{4}-\d{2}-\d{2} — \d{2}:\d{2}:\d{2} agent:\S+ session:ses_abc msg:msg_2 prompt:unknown cost:0 model:openai\/gpt-5 total:10 \(in:5 out:5 reason:0 cache-read:0 cache-write:0\)/));
});

test("promptID + cost are stamped into the line when provided", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  appendReport({ ...REPORT, promptID: "msg_user_9", cost: 0.0012 }, p);
  const entries = readEntries(p);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].includes("prompt:msg_user_9"), "prompt stamped");
  assert.ok(entries[0].includes("cost:0.0012"), "cost stamped");
});

test("auto-archives at 300 entries", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  for (let i = 0; i < 301; i++) appendReport({ ...REPORT, messageID: `m${i}` }, p);
  assert.equal(readEntries(p).length, 300);
  const archive = fs.readFileSync(path.join(dir, "TokenUsage_archive.md"), "utf8");
  assert.ok(archive.includes("m0"), "oldest moved to archive");
});

test("env-configured path is honored; skips are never written", () => {
  const dir = tmp(); const p = path.join(dir, "Custom.md");
  process.env.TOKEN_USAGE_PATH = p;
  try { assert.equal(resolveVaultPath(), p); } finally { delete process.env.TOKEN_USAGE_PATH; }
  const r = appendReport({ ok: false }, p);
  assert.equal(r.ok, false); // skips are never written
  assert.ok(!fs.existsSync(p), "skip must not create the file");
});

test("fs failures never throw", () => {
  const r = appendReport(REPORT, "Z:\\definitely\\not\\a\\dir\\\0\\TokenUsage.md");
  assert.equal(r.ok, false);
});

test("same messageID twice keeps exactly one line with the newest total", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  appendReport(REPORT, p);
  appendReport({ ...REPORT, total: 2000,
    vaultFields: { input: 1500, output: 400, reasoning: 50, cacheRead: 30, cacheWrite: 20 } }, p);
  const entries = readEntries(p);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].includes("total:2000"), "newest total wins");
});

test("messageID prefix collision does not clobber siblings (m1 vs m10)", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  appendReport({ ...REPORT, messageID: "m1" }, p);
  appendReport({ ...REPORT, messageID: "m10" }, p);
  appendReport({ ...REPORT, messageID: "m1", total: 99,
    vaultFields: { input: 90, output: 9, reasoning: 0, cacheRead: 0, cacheWrite: 0 } }, p);
  const entries = readEntries(p);
  assert.equal(entries.length, 2);
  assert.ok(entries.some((l) => /msg:m1(?:\s|$)/.test(l) && l.includes("total:99")), "m1 updated");
  assert.ok(entries.some((l) => l.includes("msg:m10") && l.includes("total:1234")), "m10 untouched");
});
