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
  assert.ok(entries[0].match(/^\d{4}-\d{2}-\d{2} — session:ses_abc msg:msg_2 model:openai\/gpt-5 total:10 \(in:5 out:5 reason:0 cache-read:0 cache-write:0\)/));
});

test("auto-archives at 50 entries", () => {
  const dir = tmp(); const p = path.join(dir, "TokenUsage.md");
  for (let i = 0; i < 51; i++) appendReport({ ...REPORT, messageID: `m${i}` }, p);
  assert.equal(readEntries(p).length, 50);
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
