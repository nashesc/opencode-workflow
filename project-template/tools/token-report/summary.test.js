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

test("renders breakdown + totals, newest-first, capped at 50 prompts", () => {
  const p = tmp();
  for (let i = 0; i < 55; i++) appendReport(rep(i), p);
  const out = getTokensSummary(p);
  assert.ok(out.includes("m54"), "newest present");
  assert.ok(!out.includes("msg m0"), "beyond cap excluded"); // oldest rotated out of shown groups
  assert.ok(out.includes("total:"), "breakdown lines");
  assert.ok(out.match(/In the last 50 requests/i), "footer group count capped");
  assert.ok(out.match(/per request/i) && out.match(/per reply/i), "totals + averages");
});

test("steps sharing one prompt collapse into a single summed row", () => {
  const p = tmp();
  const base = rep(1);
  appendReport({ ...base, messageID: "s1", promptID: "u9", total: 100, cost: 0.001,
    vaultFields: { input: 50, output: 30, reasoning: 10, cacheRead: 5, cacheWrite: 5 } }, p);
  appendReport({ ...base, messageID: "s2", promptID: "u9", total: 200, cost: 0.002,
    vaultFields: { input: 60, output: 40, reasoning: 20, cacheRead: 6, cacheWrite: 6 } }, p);
  appendReport({ ...base, messageID: "other", promptID: "u8", total: 50, cost: 0.0005,
    vaultFields: { input: 10, output: 5, reasoning: 0, cacheRead: 1, cacheWrite: 1 } }, p);
  const out = getTokensSummary(p);
  assert.ok(out.match(/In the last 2 requests/i), "two prompt groups");
  assert.ok(out.match(/prompt:u9 steps:2.*total:300/), "u9 summed");
  assert.ok(out.match(/cost:\+0\.003/), "u9 cost summed");
  assert.ok(out.match(/Billed cost: \$0\.0035/i), "cost footer summed");
  assert.ok(out.match(/3 of 3 replies are neatly grouped/i), "fully grouped signal");
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
  assert.ok(out.match(/In the last 1 requests/i));
  assert.ok(out.match(/0 of 1 replies/i), "legacy line counts as ungrouped");
});
test("unreadable path never throws", () => {
  assert.ok(getTokensSummary("Z:\\\0\\nope.md").startsWith("Token summary unavailable"));
});

test("split-view footer: context avg + hit rate + generation total", () => {
  const p = tmp();
  appendReport(rep(1), p);
  const out = getTokensSummary(p);
  assert.ok(out.match(/brand-new input/i), "context split present");
  assert.ok(out.match(/reused/i), "hit rate present");
  assert.ok(out.match(/wrote about/i), "generation total present");
  assert.ok(out.match(/In the last/i) && out.match(/per request/i), "legacy continuity kept");
  assert.ok(out.includes("openai/gpt-5"), "model named in plain words");
});
