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

test("unreadable path never throws", () => {
  assert.ok(getTokensSummary("Z:\\\0\\nope.md").startsWith("Token summary unavailable"));
});
