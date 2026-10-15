const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendReport } = require("./vault-log.js");
const { getTokensSummary } = require("./summary.js");

const rep = (i) => ({ sessionID: "ses_abc", messageID: `m${i}`, model: "openai/gpt-5", total: 100 + i,
  vaultFields: { input: 50 + i, output: 30, reasoning: 10, cacheRead: 5, cacheWrite: 5 } });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-sum-")); return path.join(d, "TokenUsage.md"); };

test("empty/missing vault → friendly message, never throws", () => {
  assert.equal(getTokensSummary(path.join(os.tmpdir(), `nope-${Date.now()}.md`)), "No token data yet.");
});

test("renders breakdown + totals, newest-first, capped at 50", () => {
  const p = tmp();
  for (let i = 0; i < 55; i++) appendReport(rep(i), p);
  const out = getTokensSummary(p);
  assert.ok(out.includes("m54"), "newest present");
  assert.ok(!out.includes("msg m0"), "beyond cap excluded"); // oldest rotated out by vault-log at 50
  assert.ok(out.includes("total:"), "breakdown lines");
  assert.ok(out.match(/count:\s*50/i), "footer count capped");
  assert.ok(out.match(/grand total:/i) && out.match(/avg/i), "totals + averages");
});

test("unparseable lines are skipped, summary still renders", () => {
  const p = tmp();
  appendReport(rep(1), p);
  fs.appendFileSync(p, "this is not an entry line\n");
  const out = getTokensSummary(p);
  assert.ok(out.includes("m1"));
  assert.ok(!out.includes("not an entry"));
});

test("old date-only lines still parse (backward compat)", () => {
  const p = tmp();
  fs.writeFileSync(p, "# TokenUsage\n\n2026-10-14 — session:ses_old msg:m_old model:openai/gpt-5 total:100 (in:50 out:30 reason:10 cache-read:5 cache-write:5)\n", "utf8");
  const out = getTokensSummary(p);
  assert.ok(out.includes("m_old"), "legacy line parsed");
  assert.ok(out.match(/count:\s*1/i));
});
test("unreadable path never throws", () => {
  assert.ok(getTokensSummary("Z:\\\0\\nope.md").startsWith("Token summary unavailable"));
});

test("split-view footer: context avg + hit rate + generation total", () => {
  const p = tmp();
  appendReport(rep(1), p);
  const out = getTokensSummary(p);
  assert.ok(out.match(/context avg:/i), "context split present");
  assert.ok(out.match(/cache-hit avg:/i), "hit rate present");
  assert.ok(out.match(/generation total:/i), "generation total present");
  assert.ok(out.match(/grand total:/i) && out.match(/avg/i), "legacy continuity kept");
});
