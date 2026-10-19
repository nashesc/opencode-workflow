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

test("empty/missing vault → friendly message, never throws", () => {
  assert.equal(getTokensSummary(path.join(os.tmpdir(), `nope-${Date.now()}.md`)), "No token data yet.");
});

test("default window is the newest 10 requests, window printed in header", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  const out = getTokensSummary(p);
  assert.match(out, /window: last 10 requests/);
  assert.match(out, /rows 10 of 15 requests/);
  assert.ok(out.includes("m14"), "newest present");
  assert.ok(!out.includes("m4 "), "oldest excluded");
  assert.match(out, /\| 1 session \|/, "session count comes from the window, not the scan");
});

test("--last N narrows rows, --days N filters by entry date", () => {
  const p = tmp();
  for (let i = 0; i < 15; i++) appendReport(rep(i), p);
  assert.match(getTokensSummary(p, { n: 3 }), /window: last 3 requests \|/);
  assert.match(getTokensSummary(p, { n: 3 }), /rows 3 of 15 requests/);
  const q = tmp();
  fs.writeFileSync(q, [line("2026-10-18", 1, { prompt: "new" }), line("2026-09-01", 2, { prompt: "old" })].join("\n"), "utf8");
  const days = getTokensSummary(q, { kind: "days", n: 7 });
  assert.match(days, /window: last 7 days/);
  assert.match(days, /rows 1 of 1 requests/);
  assert.ok(!days.includes("old"), "pre-window entry excluded");
});

test("each row reports steps, per-step cache-read and per-step fresh-in", () => {
  const p = tmp();
  const base = rep(1);
  appendReport({ ...base, messageID: "s1", promptID: "u9", total: 100,
    vaultFields: { input: 50, output: 30, reasoning: 10, cacheRead: 5, cacheWrite: 5 } }, p);
  appendReport({ ...base, messageID: "s2", promptID: "u9", total: 200,
    vaultFields: { input: 60, output: 40, reasoning: 20, cacheRead: 6, cacheWrite: 6 } }, p);
  const out = getTokensSummary(p);
  assert.match(out, /steps:\s*2 total:\s*300/, "steps summed into one row");
  assert.match(out, /cache-read\/step:\s*6 /, "cacheRead 11 over 2 steps rounds to 6");
  assert.match(out, /fresh-in\/step:\s*55/, "input 110 over 2 steps");
});

test("one rollup line per session with a printed row, over that session's whole window", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { session: "ses_new", prompt: "a", cacheRead: 900, time: "10:00:00" }),
    line("2026-10-18", 2, { session: "ses_new", prompt: "b", cacheRead: 800, time: "10:00:30" }),
    line("2026-10-18", 3, { session: "ses_old", prompt: "c", cacheRead: 700, time: "10:01:00" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  const rolls = out.split("\n").filter((l) => l.startsWith("rollup "));
  assert.equal(rolls.length, 2, "one line per session in the window, not just the newest");
  assert.equal(rolls[0], "rollup ses_old: requests:1 steps:1 total(sum of steps):840 cache-read/step:700 fresh-in/step:100 2026-10-18 10:01:00 → 2026-10-18 10:01:00");
  assert.equal(rolls[1], "rollup ses_new: requests:2 steps:2 total(sum of steps):1,980 cache-read/step:850 fresh-in/step:100 2026-10-18 10:00:00 → 2026-10-18 10:00:30");
  assert.match(out, /\| 2 sessions \|/, "both sessions printed, both counted");
});

test("rows are newest-first and the header range is never reversed", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "old", time: "08:47:55" }),
    line("2026-10-18", 2, { prompt: "mid", time: "08:52:04" }),
    line("2026-10-18", 3, { prompt: "new", time: "09:01:55" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  const labels = out.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).map((l) => l.slice(0, 19).trim());
  assert.deepEqual(labels, ["2026-10-18 09:01:55", "2026-10-18 08:52:04", "2026-10-18 08:47:55"], "ascending input still prints newest-first");
  assert.match(out, /window: last 10 requests \| 2026-10-18 08:47:55 → 2026-10-18 09:01:55 \|/);
});

test("a request is labelled by its last step time, not its first", () => {
  const p = tmp();
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "r1", time: "09:01:29" }),
    line("2026-10-18", 2, { prompt: "r1", time: "09:01:35" }),
    line("2026-10-18", 3, { prompt: "r1", time: "09:01:55" }),
    line("2026-10-18", 4, { prompt: "r2", time: "09:02:10" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  assert.match(out, /2026-10-18 09:01:55 r1\s+steps: 3/, "label is the newest step of the request");
  assert.match(out, /window: last 10 requests \| 2026-10-18 09:01:29 → 2026-10-18 09:02:10 \|/, "range spans first step of oldest to last step of newest");
});

test("over-budget windows drop oldest rows and say how many", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i % 6}`, time: `10:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p, { maxPrompts: 30 });
  assert.ok(out.split("\n").length <= 15, `${out.split("\n").length} lines`);
  assert.match(out, /\+\d+ more rows \(oldest of 30 requests\)/);
  assert.ok(!/p0\s/.test(out), "the oldest row was the one dropped");
});

test("in within 1% of cache-read flags a possible double-count", () => {
  const p = tmp();
  fs.writeFileSync(p, line("2026-10-18", 1, { prompt: "x", input: 1000, cacheRead: 1005 }), "utf8");
  const out = getTokensSummary(p);
  assert.match(out, /!dbl/, "row marked");
  assert.match(out, /flag: possible double-count — in within 1% of cache-read on 1 request/);
  assert.ok(out.split("\n").length <= 15, "flag fits the line budget");
});

test("rows near but not within 1% are not flagged", () => {
  const p = tmp();
  fs.writeFileSync(p, line("2026-10-18", 1, { prompt: "x", input: 1000, cacheRead: 950 }), "utf8");
  const out = getTokensSummary(p);
  assert.ok(!out.includes("dbl"), "5% apart is not a double-count");
});

test("a cold-then-warm request is not a double-count and is marked cold", () => {
  const p = tmp();
  // Real shape, from prompt msg_15258e0d1001OAMYpdkRYK3pcK (2026-10-19 04:09):
  // step 1 reads nothing from cache, step 2 reads nearly all of it. The sums
  // (62,474 in vs 61,956 cache-read) sit 0.8% apart but no step repeats.
  fs.writeFileSync(p, [
    line("2026-10-19", 1, { prompt: "msg_coldwarm", input: 61676, cacheRead: 140, time: "04:09:26" }),
    line("2026-10-19", 2, { prompt: "msg_coldwarm", input: 798, cacheRead: 61816, time: "04:09:32" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  assert.ok(!out.includes("!dbl"), "no step is self-similar, so no flag");
  assert.ok(!out.includes("possible double-count"), "flag line stays away");
  assert.match(out, /msg_coldwarm.*cold:61,676/, "the cold start names the first step's fresh input");
  assert.ok(out.split("\n").length <= 15, `${out.split("\n").length} lines`);
});

test("one step with in within 1% of its own cache-read still flags", () => {
  const p = tmp();
  // Two warm steps plus one self-similar step: the request-level sums are far
  // apart, so only a per-step check finds this.
  fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "x", input: 1000, cacheRead: 995, time: "10:00:00" }),
    line("2026-10-18", 2, { prompt: "x", input: 200, cacheRead: 900, time: "10:00:10" }),
    line("2026-10-18", 3, { prompt: "x", input: 4000, cacheRead: 900, time: "10:00:20" }),
  ].join("\n"), "utf8");
  const out = getTokensSummary(p);
  assert.match(out, /!dbl/, "the 1000/995 step is flagged even though the sums differ");
  assert.match(out, /flag: possible double-count — in within 1% of cache-read on 1 request/);
});

test("cold marker tracks the 5% cache share of the first step", () => {
  const p = tmp();
  const build = (input, cacheRead) => fs.writeFileSync(p, [
    line("2026-10-18", 1, { prompt: "x", input, cacheRead, time: "10:00:00" }),
    line("2026-10-18", 2, { prompt: "x", input: 50, cacheRead: 900, time: "10:00:10" }),
  ].join("\n"), "utf8");
  build(1000, 0);
  assert.match(getTokensSummary(p), /cold:1,000/, "no cache read at all is cold");
  build(100, 900);
  assert.ok(!getTokensSummary(p).includes("cold:"), "90% cache share is warm");
  build(95, 5);
  assert.ok(!getTokensSummary(p).includes("cold:"), "exactly 5% is not under it");
  build(96, 4);
  assert.match(getTokensSummary(p), /cold:96/, "3.9% cache share is cold");
  // The earliest step decides, whatever order the vault lists them in.
  fs.writeFileSync(p, [
    line("2026-10-18", 2, { prompt: "x", input: 50, cacheRead: 900, time: "10:00:10" }),
    line("2026-10-18", 1, { prompt: "x", input: 1000, cacheRead: 0, time: "10:00:00" }),
  ].join("\n"), "utf8");
  assert.match(getTokensSummary(p), /cold:1,000/, "cold start found in an ascending vault");
});

test("output stays under 15 lines with a full window plus flag", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, input: 1000, cacheRead: 1001 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p);
  assert.ok(out.split("\n").length <= 15, `${out.split("\n").length} lines`);
  assert.equal(out.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).length, 10, "10 rows");
});

test("15-line cap holds for a wide --last N window with many sessions and a flag", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(line("2026-10-18", i, { prompt: `q${i}`, session: `ses_${i % 8}`, input: 1000, cacheRead: 1001 }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  for (const maxPrompts of [20, 40, 1]) {
    const out = getTokensSummary(p, { maxPrompts });
    assert.ok(out.split("\n").length <= 15, `maxPrompts ${maxPrompts} → ${out.split("\n").length} lines`);
  }
});

test("total is labelled as a step sum, never as context size", () => {
  const p = tmp();
  appendReport(rep(1), p);
  assert.match(getTokensSummary(p), /total = sum across all steps, not context size/);
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
  assert.match(out, /window: last 10 requests/);
  assert.match(out, /rows 1 of 1 requests/);
  assert.match(out, /2026-10-14\s+m_old/);
});

test("rollup aggregates only the window, and its range stays inside the header range", () => {
  const p = tmp();
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(line("2026-10-18", i, { prompt: `w${i}`, session: "ses_w", time: `10:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p, { maxPrompts: 3 });
  const roll = out.split("\n").find((l) => l.startsWith("rollup "));
  assert.match(roll, /requests:3 steps:3/, "the 3 window requests, not all 20 scanned");
  const [lo, hi] = out.split("\n")[0].match(/\| (\S+ \S+) → (\S+ \S+) \|/).slice(1);
  const [rlo, rhi] = roll.match(/ (\S+ \S+) → (\S+ \S+)$/).slice(1);
  assert.ok(rlo >= lo && rhi <= hi, `rollup ${rlo} → ${rhi} inside header ${lo} → ${hi}`);
});

test("days mode reports a scan-limit cut window and still spans its days", () => {
  const p = tmp();
  const rows = [];
  for (let d = 4; d >= 0; d--) rows.push(line(dayOffset(d), 1, { prompt: `d${d}`, session: "ses_d" }));
  rows.push(line(dayOffset(30), 9, { prompt: "ancient", session: "ses_d" }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const cut = getTokensSummary(p, { kind: "days", days: 7, limit: 5 });
  assert.match(cut, new RegExp(`\\| ${dayOffset(4)} 10:00:00 → ${dayOffset(0)} 10:00:00 \\|`), "range spans the window days");
  assert.match(cut, /window truncated at scan limit/);
  assert.ok(!cut.includes("ancient"), "entry older than the window excluded");
  const whole = getTokensSummary(p, { kind: "days", days: 7, limit: 300 });
  assert.ok(!whole.includes("window truncated at scan limit"), "no marker when every entry was scanned");
});

test("a request cut by the scan limit is marked ~partial and kept out of the rollup", () => {
  const p = tmp();
  const rows = [];
  // Newest-first like the vault: three fresh requests, then a 29-step
  // request whose first step is the oldest entry in the file.
  for (let i = 2; i >= 0; i--) rows.push(line("2026-10-18", 100 + i, { prompt: `n${i}`, session: "ses_n", time: `10:0${i}:00` }));
  for (let i = 28; i >= 0; i--) rows.push(line("2026-10-18", i, { prompt: "big", session: "ses_p", time: `09:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const cut = getTokensSummary(p, { maxPrompts: 10, limit: 32 });
  assert.match(cut, /big\s+steps:29 total:.*~partial/, "oldest request marked partial");
  assert.ok(!cut.includes("rollup ses_p"), "a session whose only request is partial gets no rollup");
  assert.match(cut, /rollup ses_n: requests:3 steps:3/);
  const whole = getTokensSummary(p, { maxPrompts: 10, limit: 33 });
  assert.ok(!whole.includes("~partial"), "no marker when the scan reached past the first step");
});

test("unreadable path never throws", () => {
  assert.ok(getTokensSummary("Z:\\\0\\nope.md").startsWith("Token summary unavailable"));
});

// Newest-first vault: `reqs` requests of `steps` steps each, one session.
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

test("a scan too short to fill the window widens instead of under-reporting", () => {
  const p = tmp();
  fs.writeFileSync(p, multiStepVault(20, 10), "utf8");
  // 20 entries hold only 2 requests, far short of 10 — the scan must grow.
  const out = getTokensSummary(p, { maxPrompts: 10, limit: 20 });
  assert.equal(out.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).length, 10, "window filled");
  assert.match(out, /scanned 126\+ entries \(raised from limit 20 to 126\)/);
  assert.ok(!out.includes("truncated at scan limit"), "filled window, nothing to disclose");
  assert.match(out, /window: last 10 requests \|/, "header claim now true");
});

test("a window the scan cannot fill says how many of the requested it got", () => {
  const p = tmp();
  // 800 entries but only 8 requests: even the ceiling cannot reach 10.
  fs.writeFileSync(p, multiStepVault(8, 100), "utf8");
  const cut = getTokensSummary(p, { maxPrompts: 10, limit: 50 });
  assert.match(cut, /window truncated at scan limit: 3 of 10 requested/, "shortfall counted and named");
  assert.equal(cut.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).length, 3);
  assert.match(cut, /scanned 300\+ entries \(raised from limit 50 to 300\)/);
  assert.match(cut, /~partial/, "the cut request is still marked");
  const days = getTokensSummary(p, { kind: "days", days: 7, maxPrompts: 10, limit: 300 });
  assert.match(days, /window truncated at scan limit \(3 requests read\)/, "days mode reports only what it read");
  assert.ok(!days.includes("of 10 requested"), "days mode never compares against a request count");
  const q = tmp();
  fs.writeFileSync(q, multiStepVault(8, 10), "utf8");
  const whole = getTokensSummary(q, { maxPrompts: 10, limit: 300 });
  assert.ok(!whole.includes("truncated at scan limit"), "no marker when the whole file was read");
  assert.equal(whole.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).length, 8);
});

test("days mode reports the scan cut as a read count, last mode as a shortfall", () => {
  const p = tmp();
  // 800 entries but only 8 requests: even the ceiling scan cannot reach the
  // file's end, so the window is cut in both modes — only the wording differs.
  fs.writeFileSync(p, multiStepVault(8, 100, { date: dayOffset(0) }), "utf8");
  const days = getTokensSummary(p, { kind: "days", days: 7, maxPrompts: 10, limit: 300 });
  assert.match(days, /window truncated at scan limit \((\d+) requests read\)/, "days mode names what it read");
  const read = +days.match(/window truncated at scan limit \((\d+) requests read\)/)[1];
  assert.ok(read > 0, `a count is present, got ${read}`);
  assert.ok(!/\d+ of \d+ requested/.test(days), "days mode never compares against maxPrompts");
  const last = getTokensSummary(p, { maxPrompts: 10, limit: 300 });
  assert.ok(!last.includes("truncated at scan limit ("), "the paren form is days-only");
  assert.match(last, /window truncated at scan limit: \d+ of 10 requested/, "last mode keeps the requested form");
});

test("a single hidden rollup is named in the singular", () => {
  const p = tmp();
  // 12 requests; the 11 newest span three sessions, and the oldest is the only
  // request of its session, so the budget drops exactly one rollup.
  const rows = [line("2026-10-18", "old", { session: "ses_old", prompt: "p0", time: "10:00:00" })];
  for (let i = 0; i < 11; i++) rows.push(line("2026-10-18", `n${i}`, { session: `ses_${i % 3}`, prompt: `p${i + 1}`, time: `10:${String(i + 1).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p, { maxPrompts: 12 });
  assert.match(out, /\+1 session not shown\b/, "one hidden session is singular");
  assert.ok(!out.includes("+1 sessions"), "no plural for a single session");
});

test("header session count is the window's, and cap-dropped rollups are disclosed", () => {
  const p = tmp();
  const rows = [];
  // One request per session, so every dropped row also drops a rollup.
  for (let i = 0; i < 15; i++) rows.push(line("2026-10-18", i, { prompt: `p${i}`, session: `ses_${i}`, time: `10:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(p, rows.join("\n"), "utf8");
  const out = getTokensSummary(p, { maxPrompts: 15 });
  assert.match(out, /\| 15 sessions \|/, "counted from the window, not the printed rows");
  const rolls = out.split("\n").filter((l) => l.startsWith("rollup "));
  const shown = out.split("\n").filter((l) => /steps:\s*\d+ total:/.test(l)).length;
  assert.equal(rolls.length, shown, "a rollup survives only with its row");
  assert.ok(rolls.length < 15, "the cap really did drop rollups");
  assert.ok(out.includes(`+${15 - rolls.length} sessions not shown`), "the dropped rollups are named");
  assert.ok(out.split("\n").length <= 15, `${out.split("\n").length} lines`);
  // The oldest request is cut by the scan, so its lone session has no rollup
  // for a reason that is not the cap — it must not be counted as cap-dropped.
  const q = tmp();
  const cut = [];
  for (let i = 0; i < 16; i++) cut.push(line("2026-10-18", i, { prompt: `c${i}`, session: `ses_${i}`, time: `10:${String(i).padStart(2, "0")}:00` }));
  fs.writeFileSync(q, cut.join("\n"), "utf8");
  const cutOut = getTokensSummary(q, { maxPrompts: 16, limit: 16 });
  const cutRolls = cutOut.split("\n").filter((l) => l.startsWith("rollup ")).length;
  assert.ok(cutOut.includes(`+${16 - cutRolls - 1} sessions not shown`), "partial-only session excluded from the count");
  // Its session has no rollup because the scan cut it, not the cap.
  const t = tmp();
  fs.writeFileSync(t, [
    line("2026-10-18", 0, { prompt: "c0", session: "ses_0", time: "10:00:00" }),
    line("2026-10-18", 1, { prompt: "c1", session: "ses_1", time: "10:01:00" }),
  ].join("\n"), "utf8");
  const cutTwo = getTokensSummary(t, { maxPrompts: 2, limit: 2 });
  assert.match(cutTwo, /c0\s+steps: 1 .*~partial/, "oldest request marked partial");
  assert.match(cutTwo, /\| 2 sessions \|/, "both window sessions counted");
  assert.ok(!cutTwo.includes("sessions not shown"), "a partial-only session is not reported as cap-dropped");
});