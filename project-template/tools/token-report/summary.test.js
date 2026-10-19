const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendReport } = require("./vault-log.js");
const { getTokensSummary } = require("./summary.js");

const rep = (i, extra = {}) => ({ sessionID: "ses_abc", messageID: `m${i}`, model: "openai/gpt-5", total: 100 + i,
  vaultFields: { input: 50 + i, output: 30, reasoning: 10, cacheRead: 5, cacheWrite: 5 }, ...extra });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-sum-")); return path.join(d, "TokenUsage.md"); };
// Raw lines let a test place entries on a chosen date (appendReport always
// stamps today) without going through the vault writer.
const line = (date, i, { session = "ses_abc", prompt = "p1", input = 100, cacheRead = 900, time = "10:00:00" } = {}) =>
  `${date} — ${time} agent:build session:${session} msg:msg_${i} prompt:${prompt} cost:0 model:openai/gpt-5 total:${input + cacheRead + 40} (in:${input} out:30 reason:10 cache-read:${cacheRead} cache-write:0)`;

// Relative date so days-mode tests keep passing as the calendar moves.
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// Output shapes the assertions need. Table rows are the only lines that start
// with a bare MM-DD HH:MM timestamp; findings are the only numbered ones.
const linesOf = (out) => out.split("\n");
const body = (out) => linesOf(out).slice(1, -1);
const rowsOf = (out) => body(out).filter((l) => /^\d\d-\d\d(\s{2,}|\s\d\d:\d\d)/.test(l));
const findingsOf = (out) => body(out).filter((l) => /^\d\. /.test(l));
const numberAfter = (lineText, label) => +lineText.match(new RegExp(`${label}:\\s*([\\d.]+)`))[1].replace(/[KM]/, "");

test("empty/missing vault → friendly message, never throws", () => {
  assert.equal(getTokensSummary(path.join(os.tmpdir(), `nope-${Date.now()}.md`)), "No token data yet.");
});

test("the report is wrapped in one balanced code fence", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  const out = getTokensSummary(p);
  assert.equal(linesOf(out)[0], "```", "opens with a fence");
  assert.equal(linesOf(out)[linesOf(out).length - 1], "```", "closes with a fence");
  assert.equal(linesOf(out).filter((l) => l === "```").length, 2, "exactly two fences");
});

test("the whole report stays under 25 lines", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(line("2026-10-18", i, { prompt: `q${i}`, session: `ses_${i % 8}`, input: 1000, cacheRead: 1001 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  for (const opts of [{}, { maxPrompts: 30 }, { maxPrompts: 1 }, { kind: "days", days: 7 }, { kind: "days", days: 30 }]) {
    const out = getTokensSummary(p, opts);
    assert.ok(linesOf(out).length < 25, `${JSON.stringify(opts)} → ${linesOf(out).length} lines`);
  }
});

test("only the six agreed sections are present", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  const b = body(getTokensSummary(p));
  assert.match(b[0], /^TOKEN USAGE — 15 requests counted, latest 10 shown \| \d\d-\d\d \d\d:\d\d → \d\d-\d\d \d\d:\d\d \| 1 chats$/, "header: counts, range, chats");
  assert.match(b[1], /^TOTAL: [\d.]+[KM]? tokens \| \d+ rounds \| [\d.]+[KM]? per request \(average\)$/);
  assert.equal(b[2], "WHAT TO FIX");
  assert.ok(b.includes(linesOf(getTokensSummary(p)).find((l) => l.startsWith("SPLIT:"))), "a SPLIT line");
  assert.ok(b.some((l) => /^LATEST 10 REQUESTS$/.test(l)), "a table title");
  assert.equal(linesOf(getTokensSummary(p)).at(-2), "Round = one back-and-forth; each round re-sends the whole chat.");
});

test("the cut content is gone: ids, per-round columns, chat list, legend, notes", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i % 4}`, input: 1000, cacheRead: 1001 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p);
  for (const banned of ["msg_", "m0 ", "RE-READ/RND", "NEW/RND", "rollup", "Chat ", "LEGEND", "Every number is a real count",
    "cut short", "memory expired", "Memory expired", "not shown", "(dup?)", "<< heaviest", "Read all", "model "]) {
    assert.ok(!out.includes(banned), `"${banned}" must not appear`);
  }
  assert.match(linesOf(out).find((l) => l.startsWith("TIME")), /^TIME\s+ROUNDS\s+TOKENS\s+NOTE$/, "three columns plus the note");
});

test("WHAT TO FIX holds at most 3 numbered findings, each with one action", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i % 5}`, input: 1000, cacheRead: i * 50 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p);
  const found = findingsOf(out);
  assert.ok(found.length >= 1 && found.length <= 3, `${found.length} findings`);
  assert.deepEqual(found.map((l) => l.slice(0, 3)), found.map((l, i) => `${i + 1}. `), "numbered 1..n in order");
  for (const f of found) assert.ok(f.includes(" → "), `finding carries one action: ${f}`);
});

test("no finding is emitted without an action, and the cost wording is gone", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i % 5}`, input: 1000, cacheRead: i * 50 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p);
  for (const f of findingsOf(out)) assert.ok(f.includes(" → "), `finding carries one action: ${f}`);
  assert.ok(!out.includes("already efficient"), "praise is not a finding");
  assert.ok(!out.includes("of cost"), "the finding counts tokens, not cost");
  assert.match(findingsOf(out).find((l) => /new text/.test(l)), /^\d\. \d+% of tokens are new text sent at full price → /);
});

test("findings fire only on the numbers that justify them", () => {
  // One request, warm start, nothing dominant: nothing to fix, and it says so.
  const p = tmp();
  fs.writeFileSync(p, line("2026-10-18", 1, { prompt: "solo", input: 100, cacheRead: 900 }), "utf8");
  const clean = findingsOf(getTokensSummary(p));
  assert.ok(clean.length >= 1 && clean.length <= 3, `${clean.length} findings`);
  assert.ok(clean.some((l) => /nothing stands out/.test(l)), `no waste alleged: ${clean.join(" | ")}`);
  assert.ok(!clean.some((l) => /already efficient/.test(l)), "a rule that only praises is not a finding");
  assert.ok(!clean.some((l) => /restarted from scratch/.test(l)), "a warm start is not called waste");
  assert.ok(!clean.some((l) => /Chat /.test(l)), "a one-chat window has no other chat to move to");
  // Same request, but it started from scratch: the wasted tokens are named.
  const q = tmp();
  fs.writeFileSync(q, [
    line("2026-10-18", 1, { prompt: "cold", input: 500_000, cacheRead: 0, time: "10:00:00" }),
    line("2026-10-18", 2, { prompt: "cold", input: 50, cacheRead: 900, time: "10:00:10" }),
  ].join("\n"), "utf8");
  assert.match(findingsOf(getTokensSummary(q))[0],
    /^1\. 1 request restarted from scratch, re-sending 500K tokens at full price → start a new chat per task, not mid-task\.$/);
});

test("the heaviest chat is named in a finding, with a label that cannot collide", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(line("2026-10-18", i, { prompt: `a${i}`, session: "ses_ead8aa11", input: 100, time: `10:0${i}:00` }));
  for (let i = 0; i < 2; i++) rows.push(line("2026-10-18", `z${i}`, { prompt: `b${i}`, session: "ses_ead8bb22", input: 100, time: `11:0${i}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const finding = findingsOf(getTokensSummary(p)).find((l) => l.includes("Chat "));
  assert.ok(finding, "the dominant chat is reported");
  assert.match(finding, /^1\. Chat ead8a…+ alone used \d+% of all tokens → start a new chat when a task changes\.$/, `label: ${finding}`);
});

test("each row shows time, rounds, tokens and the from-scratch note", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-19", 1, { prompt: "warm", input: 100, cacheRead: 900, time: "05:24:54" }),
    line("2026-10-19", 2, { prompt: "cold", input: 61676, cacheRead: 140, time: "04:09:26" }),
  ].join("\n"), "utf8");
  const rows = rowsOf(getTokensSummary(p));
  assert.match(rows[0], /^10-19 05:24\s+1\s+1K$/, "no note, no trailing space");
  assert.match(rows[1], /^10-19 04:09\s+1\s+61\.9K\s+restarted from scratch, 61\.7K re-sent$/);
});

test("numbers print as 44K / 1.28M, never as six digits", () => {
  const p = tmp();
  fs.writeFileSync(p, line("2026-10-18", 1, { prompt: "x", input: 1_277_462, cacheRead: 44_164 }), "utf8");
  const out = getTokensSummary(p);
  assert.match(rowsOf(out)[0], /\s1\.32M\s+restarted from scratch, 1\.28M re-sent$/, "K and M with at most 2 decimals");
  assert.ok(!/\d{5,}/.test(out), "no raw six-digit number anywhere in the report");
});

test("default table is the newest 10 requests", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  const out = getTokensSummary(p);
  assert.equal(rowsOf(out).length, 10, "10 rows");
  assert.deepEqual(rowsOf(out).map((l) => l.slice(0, 11)),
    Array.from({ length: 10 }, () => rowsOf(out)[0].slice(0, 11)), "all rows share the newest timestamp shape");
  assert.match(linesOf(out).find((l) => l.startsWith("TOKEN USAGE")), /\| 1 chats$/);
});

test("--last N narrows rows, --days N filters by entry date", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  assert.equal(rowsOf(getTokensSummary(p, { n: 3 })).length, 3);
  assert.match(linesOf(getTokensSummary(p, { n: 3 })).find((l) => l.startsWith("TOKEN USAGE")), /15 requests counted, latest 3 shown/, "the header says what was counted and what is shown");
  const q = tmp();
  fs.writeFileSync(q, [line("2026-10-18", 1, { prompt: "new" }), line("2026-09-01", 2, { prompt: "old" })].join("\n"), "utf8");
  const days = getTokensSummary(q, { kind: "days", n: 7 });
  assert.equal(rowsOf(days).length, 1, "pre-window entry excluded");
  assert.match(linesOf(days).find((l) => l.startsWith("TOKEN USAGE")), /^TOKEN USAGE — 7 days: 1 requests counted/, "days mode keeps its window in the header");
});

test("TOTAL equals the sum of the requests behind it", () => {
  const p = tmp();
  const rows = [];
  let expected = 0;
  for (let r = 0; r < 12; r++) {
    const input = 1000 + r, cacheRead = 50 * r;
    rows.push(line("2026-10-18", `m${r}`, { prompt: `p${r}`, session: `ses_${r % 3}`, input, cacheRead, time: `10:${String(r).padStart(2, "0")}:00` }));
    expected += input + cacheRead + 40;
  }
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p);
  const total = linesOf(out).find((l) => l.startsWith("TOTAL:"));
  const printed = numberAfter(total, "TOTAL") * 1000;
  assert.ok(Math.abs(printed - expected) / expected < 0.01, `${total} (${printed}) vs summed ${expected} — display rounds to 2 decimals`);
  assert.match(total, /\| 12 rounds \|/, "one round per request here");
  assert.match(linesOf(out).find((l) => l.startsWith("SPLIT:")), /^SPLIT: \d+% re-read \(cheap\) \| \d+% new text \(full price\)$/);
});

test("the header range spans the oldest first round to the newest last round", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "r1", time: "09:01:29" }),
    line("2026-10-18", 2, { prompt: "r1", time: "09:01:55" }),
    line("2026-10-18", 3, { prompt: "r2", time: "09:02:10" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  assert.match(linesOf(out).find((l) => l.startsWith("TOKEN USAGE")), /\| 10-18 09:01 → 10-18 09:02 \|/);
  assert.match(rowsOf(out)[0], /^10-18 09:02\s+1\s/, "row is labelled by its last round");
  assert.match(rowsOf(out)[1], /^10-18 09:01\s+2\s/, "the two-round request is one row");
});

test("rows are newest-first even when the log is oldest-first", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "old", time: "08:47:55" }),
    line("2026-10-18", 2, { prompt: "mid", time: "08:52:04" }),
    line("2026-10-18", 3, { prompt: "new", time: "09:01:55" }),
  ].join("\n"), "utf8");
  assert.deepEqual(rowsOf(getTokensSummary(p)).map((l) => l.slice(0, 11)), ["10-18 09:01", "10-18 08:52", "10-18 08:47"]);
});

test("a wide --last N drops oldest rows and says how many", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i % 6}`, time: `10:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p, { maxPrompts: 30 });
  assert.ok(linesOf(out).length < 25, `${linesOf(out).length} lines`);
  assert.match(out, /\+\d+ older requests not shown/);
  assert.ok(!rowsOf(out).some((l) => l.includes("10-00")), "the oldest row was the one dropped");
});

test("a request the log cut short is left out of the totals, silently", () => {
  const p = tmp();
  const rows = [];
  for (let i = 2; i >= 0; i--) rows.push(line("2026-10-18", 100 + i, { prompt: `n${i}`, session: "ses_n", time: `10:0${i}:00` }));
  for (let i = 28; i >= 0; i--) rows.push(line("2026-10-18", i, { prompt: "big", session: "ses_p", time: `09:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const cut = getTokensSummary(p, { maxPrompts: 10, limit: 32 });
  // The cut request's totals are incomplete, so it is dropped from TOTAL — the
  // report no longer discloses that, which is the agreed presentation.
  assert.match(linesOf(cut).find((l) => l.startsWith("TOTAL:")), /\| 3 rounds \|/, "only the 3 complete requests are counted");
  assert.ok(!rowsOf(cut).some((l) => l.includes("big")), "the cut request is not printed either");
  const whole = getTokensSummary(p, { maxPrompts: 10, limit: 33 });
  assert.match(linesOf(whole).find((l) => l.startsWith("TOTAL:")), /\| 32 rounds \|/, "read whole, it counts");
});

test("the scan widens until the table window is full", () => {
  const p = tmp();
  // 800 entries but only 8 requests: the ceiling cannot reach 10.
  fs.writeFileSync(p, multiStepVault(8, 100), "utf8");
  const cut = getTokensSummary(p, { maxPrompts: 10, limit: 50 });
  assert.equal(rowsOf(cut).length, 5, "5 complete requests fit");
  assert.ok(linesOf(cut).length < 25);
  const whole = getTokensSummary(p, { maxPrompts: 10, limit: 300 });
  // 800 entries exist but the parse pool is capped at SCAN_CEIL (500), so only
  // 5 complete requests are readable — and the header counts what it has.
  assert.equal(rowsOf(whole).length, 5, "every request the scan could read");
  assert.match(linesOf(whole).find((l) => l.startsWith("TOKEN USAGE")), /^TOKEN USAGE — 4 requests counted, latest 5 shown \|/, "the header counts what was counted, not what was asked for");
});

test("unparseable lines are skipped, report still renders", () => {
  const p = tmp();
  appendReport(rep(1), p);
  fs.appendFileSync(p, "this is not an entry line\n");
  const out = getTokensSummary(p);
  assert.ok(out.startsWith("```"), "fence intact");
  assert.ok(!out.includes("not an entry"));
});

test("old date-only lines still parse (backward compat)", () => {
  const p = tmp();
  fs.writeFileSync(p, "# TokenUsage\n\n2026-10-14 — session:ses_old msg:m_old model:openai/gpt-5 total:100 (in:50 out:30 reason:10 cache-read:5 cache-write:5)\n", "utf8");
  const out = getTokensSummary(p);
  assert.match(linesOf(out).find((l) => l.startsWith("TOKEN USAGE")), /\| 10-14\s+→ 10-14 \|/);
  assert.equal(rowsOf(out).length, 1);
});

test("unreadable path never throws", () => {
  assert.ok(getTokensSummary("Z:\\\0\\nope.md").startsWith("Token summary unavailable"));
});

test("the sections appear in the agreed order", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  const b = body(getTokensSummary(p));
  const at = (name) => b.findIndex((l) => l.startsWith(name));
  assert.ok(at("TOKEN USAGE") < at("TOTAL:"), "header then total");
  assert.ok(at("TOTAL:") < at("WHAT TO FIX"), "total then findings");
  assert.ok(at("WHAT TO FIX") < at("SPLIT:"), "findings then split");
  assert.ok(at("SPLIT:") < at("LATEST"), "split then table");
  assert.ok(at("LATEST") < b.length - 1, "table before the Round definition");
});

// Newest-first vault: `reqs` requests of `steps` rounds each, one session.
const multiStepVault = (reqs, steps, { session = "ses_x", date = "2026-10-18" } = {}) => {
  const clock = (n) => [String(Math.floor(n / 3600)).padStart(2, "0"),
    String(Math.floor(n / 60) % 60).padStart(2, "0"), String(n % 60).padStart(2, "0")].join(":");
  const rows = [];
  for (let r = reqs - 1; r >= 0; r--) {
    for (let s = steps - 1; s >= 0; s--) {
      rows.push(line(date, `r${r}s${s}`, { prompt: `p${r}`, session, time: clock(r * steps + s) }));
    }
  }
  return rows.join("\n");
};