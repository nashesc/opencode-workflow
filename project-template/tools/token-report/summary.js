"use strict";
const fs = require("node:fs");
// prompt:/cost: groups are optional so legacy per-message lines (pre
// per-prompt format) still parse — each becomes its own single-step group.
// Leading group captures the entry date (YYYY-MM-DD) so date windows work.
const ENTRY_RE = /^(\d{4}-\d{2}-\d{2})\s+[—-]\s+(?:(\d{2}:\d{2}:\d{2})\s+)?(?:agent:(\S+)\s+)?session:(\S+)\s+msg:(\S+)(?: prompt:(\S+))?(?: cost:([\d.]+))?\s+model:(\S+)\s+total:(\d+)\s+\(in:(\d+)\s+out:(\d+)\s+reason:(\d+)\s+cache-read:(\d+)\s+cache-write:(\d+)\)/;

// Hard output budget, everything inside the fence: header + TOTAL + WHAT TO
// FIX (its title plus up to MAX_FINDINGS lines) + SPLIT + the table title and
// column header + rows + the Round definition. Rows drop oldest-first only
// when a wide --last N cannot fit.
const MAX_LINES = 24;
const FENCE_LINES = 2;
const MAX_FINDINGS = 3;
const TABLE_COLUMNS = { time: 11, rounds: 6, tokens: 8 };
// Below this cache share on its first step, a request counts as cold-start.
const COLD_SHARE = 0.05;
const DEFAULT_ROWS = 10;
// The SUMMARY always covers the newest 50 requests; the table shows the newest
// maxPrompts of that same window.
const SUMMARY_REQUESTS = 50;
// Historical scan floor: never read fewer than this many entries, and never
// more than the window can use. SCAN_CEIL doubles as the hard cap on parsed
// entries and as the target a request window widens to when it is too short.
// It sits above SUMMARY_REQUESTS × the observed ~9 rounds per request, so the
// summary is never the reason the scan stops short.
const SCAN_FLOOR = 50;
const SCAN_CEIL = 500;

function parseLine(line) {
  const m = ENTRY_RE.exec(line.trim());
  if (!m) return null;
  const [, date, time, agent, sessionID, messageID, promptID, cost, model, total, input, output, reasoning, cacheRead, cacheWrite] = m;
  return { date, time: time || null, at: time ? `${date} ${time}` : date,
    sortKey: `${date} ${time || "00:00:00"}`,
    agent: agent || "unknown", sessionID, messageID,
    promptID: promptID || null, cost: cost === undefined ? 0 : +cost,
    model, total: +total, input: +input, output: +output, reasoning: +reasoning,
    cacheRead: +cacheRead, cacheWrite: +cacheWrite, raw: line.trim() };
}

function cutoffDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

// A request is cold-start when its first step reads almost nothing from cache
// (share < 5% of that step's own context); K is the fresh input it did read.
function isColdStart(g) {
  const ctx = g.firstIn + g.firstCacheRead;
  return ctx > 0 && g.firstCacheRead < COLD_SHARE * ctx;
}

const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// 534 / 44.2K / 244K / 1.28M — a six-digit column helps nobody.
const trimZero = (s) => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
function fmtNum(n) {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  if (a < 1000) return String(v);
  if (a < 100000) return `${trimZero((v / 1000).toFixed(1))}K`;
  if (a < 1e6) return `${Math.round(v / 1000)}K`;
  if (a < 1e7) return `${trimZero((v / 1e6).toFixed(2))}M`;
  return `${(v / 1e6).toFixed(1)}M`;
}

const pct = (v, d) => (d > 0 ? Math.round((v / d) * 100) : 0);

// "ses_ead7397f..." -> "ead7...": the "ses_" prefix is identical on every chat,
// so the first characters that actually differ are the useful ones. Four is
// the floor; a chat grows past it only when another chat shares its prefix that
// deep, so two labels can never name the same chat.
const chatId = (s) => String(s).replace(/^ses_/, "");
function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}
function chatTags(list) {
  const ids = list.map((a) => chatId(a.session));
  const tags = new Map();
  list.forEach((a, i) => {
    const id = ids[i];
    let n = 4;
    ids.forEach((other, j) => {
      if (j !== i) n = Math.max(n, Math.min(commonPrefix(id, other) + 1, id.length));
    });
    tags.set(a.session, n >= id.length ? id : `${id.slice(0, n)}…`);
  });
  return tags;
}
// Newest last-step first. sortKey is "YYYY-MM-DD HH:MM:SS", so a plain string
// compare is chronological regardless of the order lines sit in the file.
const newestFirst = (a, b) => (a.lastKey < b.lastKey ? 1 : a.lastKey > b.lastKey ? -1 : 0);

// Group steps per prompt. Legacy lines without prompt attribution each form
// their own single-step group. A group's first/last step time is derived from
// the values, not from file order, so an ascending vault (the archive) groups
// identically to a newest-first one. Newest last-step first; sortKey is
// "YYYY-MM-DD HH:MM:SS", so a plain string compare is chronological.
function buildGroups(entries) {
  const groups = [];
  const byKey = new Map();
  for (const e of entries) {
    const key = e.promptID && e.promptID !== "unknown"
      ? `${e.sessionID} ${e.promptID}`
      : `${e.sessionID} msg:${e.messageID}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, prompt: e.promptID && e.promptID !== "unknown" ? e.promptID : e.messageID,
        session: e.sessionID, model: e.model,
        firstKey: e.sortKey, firstAt: e.at, firstIn: e.input, firstCacheRead: e.cacheRead,
        lastKey: e.sortKey, lastAt: e.at,
        steps: 0, total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
      byKey.set(key, g); groups.push(g);
    }
    g.steps += 1;
    g.total += e.total; g.input += e.input; g.output += e.output; g.reasoning += e.reasoning;
    g.cacheRead += e.cacheRead; g.cacheWrite += e.cacheWrite;
    if (e.sortKey < g.firstKey) {
      g.firstKey = e.sortKey; g.firstAt = e.at; g.firstIn = e.input; g.firstCacheRead = e.cacheRead;
    }
    if (e.sortKey > g.lastKey) { g.lastKey = e.sortKey; g.lastAt = e.at; }
  }
  groups.sort(newestFirst);
  return groups;
}

// One line per chat, aggregating every request the window holds for that chat
// (never a group outside it). Requests cut by the scan limit are excluded —
// their step sums are incomplete.
function rollupFor(windowGroups) {
  const agg = new Map();
  for (const g of windowGroups) {
    if (g.partial) continue;
    if (!agg.has(g.session)) agg.set(g.session, { session: g.session, requests: 0, steps: 0, total: 0, input: 0, cacheRead: 0, loKey: null, loAt: null, hiKey: null, hiAt: null });
    const a = agg.get(g.session);
    a.requests += 1;
    a.steps += g.steps; a.total += g.total; a.input += g.input; a.cacheRead += g.cacheRead;
    if (a.loKey === null || g.firstKey < a.loKey) { a.loKey = g.firstKey; a.loAt = g.firstAt; }
    if (a.hiKey === null || g.lastKey > a.hiKey) { a.hiKey = g.lastKey; a.hiAt = g.lastAt; }
  }
  return [...agg.values()].filter((a) => a.requests > 0)
    .sort((a, b) => (a.hiKey < b.hiKey ? 1 : a.hiKey > b.hiKey ? -1 : 0));
}

const COLUMN_HEADER = `${pad("TIME", TABLE_COLUMNS.time)} ${padL("ROUNDS", TABLE_COLUMNS.rounds)} ` +
  `${padL("TOKENS", TABLE_COLUMNS.tokens)}  NOTE`;

// One request: when it ran, how many rounds it took, what it cost, and the only
// thing worth flagging — that it restarted from scratch (a fresh start
// re-sends the whole chat at full price).
function tableRow(g) {
  const note = isColdStart(g) ? `restarted from scratch, ${fmtNum(g.firstIn)} re-sent` : "";
  return `${pad(g.lastAt.slice(5, 16), TABLE_COLUMNS.time)} ${padL(g.steps, TABLE_COLUMNS.rounds)} ` +
    `${padL(fmtNum(g.total), TABLE_COLUMNS.tokens)}  ${note}`.replace(/\s+$/, "");
}

// Up to MAX_FINDINGS findings, each one finding plus one action. Every rule
// reads numbers buildGroups already made; the first three that fire win, and
// a clean window still gets a line saying so. A rule that cannot name an
// action is no rule — praise is not a finding.
function findingsFor(base, chats, tags, ctx) {
  const { total, avg, waste, expired, freshShare, heaviestChat, heaviestRequest } = ctx;
  const out = [];
  if (expired > 0 && waste > 0.1 * total)
    out.push(`${expired} request${expired === 1 ? "" : "s"} restarted from scratch, re-sending ${fmtNum(waste)} tokens at full price → start a new chat per task, not mid-task.`);
  // Only when the window holds another chat: a single-chat window would
  // otherwise report "100% of all tokens" and send the reader nowhere.
  if (heaviestChat && chats.length >= 2 && pct(heaviestChat.total, total) > 40)
    out.push(`Chat ${tags.get(heaviestChat.session)} alone used ${pct(heaviestChat.total, total)}% of all tokens → start a new chat when a task changes.`);
  if (heaviestRequest && heaviestRequest.steps >= 5 && heaviestRequest.total > 3 * avg)
    out.push(`heaviest request ran ${heaviestRequest.steps} rounds for ${fmtNum(heaviestRequest.total)} → every round re-sends the chat, so split big topics.`);
  if (freshShare > 50)
    out.push(`${freshShare}% of tokens are new text sent at full price → trim long pasted logs and file dumps.`);
  if (out.length === 0)
    out.push(`nothing stands out: ${base.length} requests averaged ${fmtNum(avg)} tokens each → keep going.`);
  return out.slice(0, MAX_FINDINGS).map((f, i) => `${i + 1}. ${f}`);
}

// Every fixed section above the table, in the order the report reads. Reads
// only fields buildGroups already computed.
function headLines(base, chats, tags, headerLine, rowCount) {
  const sum = (f) => base.reduce((a, g) => a + f(g), 0);
  const total = sum((g) => g.total), rounds = sum((g) => g.steps);
  const fresh = sum((g) => g.input), reread = sum((g) => g.cacheRead);
  const avg = total / base.length;
  const den = fresh + reread;
  const freshShare = pct(fresh, den);
  const expired = base.filter(isColdStart);
  const ctx = {
    total, avg, freshShare,
    waste: expired.reduce((a, g) => a + g.firstIn, 0),
    expired: expired.length,
    heaviestChat: chats.reduce((a, c) => (a === null || c.total > a.total ? c : a), null),
    heaviestRequest: base.reduce((a, g) => (a === null || g.total > a.total ? g : a), null),
  };
  return [
    headerLine,
    `TOTAL: ${fmtNum(total)} tokens | ${rounds} rounds | ${fmtNum(avg)} per request (average)`,
    "WHAT TO FIX",
    ...findingsFor(base, chats, tags, ctx),
    `SPLIT: ${pct(reread, den)}% re-read (cheap) | ${freshShare}% new text (full price)`,
    `LATEST ${rowCount} REQUESTS`,
    COLUMN_HEADER,
  ];
}

function getTokensSummary(vaultPath, opts = {}) {
  const o = opts || {};
  const { limit = SCAN_CEIL, kind = "last", days = 7 } = o;
  const maxPrompts = Math.max(1, o.maxPrompts || o.n || DEFAULT_ROWS);
  try {
    if (typeof vaultPath !== "string" || vaultPath.includes("\0")) throw new Error("invalid vault path");
    let text;
    try { text = fs.readFileSync(vaultPath, "utf8"); } catch { return "No token data yet."; }
    // Pool: parsed entries kept for the scan, hard-capped so a huge vault is
    // never fully materialised. totalParsed counts every parseable entry in the
    // file, so "the file held more than we read" is known, not guessed.
    const pool = [];
    let totalParsed = 0;
    for (const raw of text.split("\n")) {
      const e = parseLine(raw);
      if (!e) continue;
      totalParsed += 1;
      if (pool.length < SCAN_CEIL) pool.push(e);
    }
    if (pool.length === 0) return "No token data yet.";
    const inDays = (es) => es.filter((e) => e.date >= cutoffDate(days));
    // A days window can span far more entries than a request window, so the
    // scan goes to the ceiling; a request window grows only as far as filling
    // it needs. The oldest entry read may be a request's first step, which
    // makes that request's sums incomplete.
    const cutKey = (es) => {
      if (es.length < limit) return null;
      let oldest = es[0];
      for (const e of es) if (e.sortKey < oldest.sortKey) oldest = e;
      return oldest.sortKey;
    };
    const scanned = (n) => {
      const es = pool.slice(0, n);
      return kind === "days" ? buildGroups(inDays(es)) : buildGroups(es);
    };
    let scan = Math.min(pool.length, limit);
    let groups = scanned(scan);
    if (kind === "last") {
      // The summary always needs the newest SUMMARY_REQUESTS, whatever --last
      // asks the table for, so that is the widening target.
      const need = Math.max(maxPrompts, SUMMARY_REQUESTS);
      while (totalParsed > scan && scan < pool.length) {
        const key = cutKey(pool.slice(0, scan));
        const readable = groups.filter((g) => g.firstKey !== key).length;
        if (readable >= need) break;
        scan = Math.min(pool.length, SCAN_CEIL, Math.max(scan + 32, Math.ceil(scan * 1.5)));
        groups = scanned(scan);
      }
    }
    const entries = pool.slice(0, scan);
    if (groups.length === 0) return "No token data yet.";
    // The oldest entry read can be that request's first step, so its sums are
    // incomplete and it is kept out of the totals.
    const partialKey = cutKey(entries);
    if (partialKey !== null) {
      const cut = groups.find((g) => g.firstKey === partialKey);
      if (cut) cut.partial = true;
    }
    // The window is the summary scope: the newest SUMMARY_REQUESTS requests, or
    // in days mode everything the scan read inside the days. The table shows
    // the newest maxPrompts of it.
    const wanted = kind === "days" ? groups.length : Math.min(Math.max(maxPrompts, SUMMARY_REQUESTS), groups.length);
    const windowGroups = groups.slice(0, wanted);
    const base = windowGroups.filter((g) => !g.partial);
    const chats = rollupFor(base);
    const tags = chatTags(chats);
    const rowTarget = Math.min(maxPrompts, windowGroups.length);
    let rows = windowGroups.slice(0, rowTarget);
    // Header range spans the whole window the totals cover.
    let lo = windowGroups[0];
    let hi = windowGroups[0];
    for (const g of windowGroups) {
      if (g.firstKey < lo.firstKey) lo = g;
      if (g.lastKey > hi.lastKey) hi = g;
    }
    const windowChats = new Set(base.map((g) => g.session)).size;
    // The counts are what the totals actually cover and what the table actually
    // prints, so the header can never claim a window the scan could not fill.
    const scope = kind === "days"
      ? `${days} days: ${base.length} requests counted`
      : `${base.length} requests counted`;
    const headerLine = `TOKEN USAGE — ${scope}, latest ${rowTarget} shown | ${lo.firstAt.slice(5, 16)} → ${hi.lastAt.slice(5, 16)} | ${windowChats} chats`;
    const fixed = base.length === 0
      ? [headerLine, "Nothing complete to show: the log limit cut every request in this window.", `LATEST ${rowTarget} REQUESTS`, COLUMN_HEADER]
      : headLines(base, chats, tags, headerLine, rowTarget);
    // Fit the budget: only a wide --last N can push the table over, and it
    // drops oldest rows rather than a section.
    const cost = () => FENCE_LINES + fixed.length + rows.length + (rows.length < rowTarget ? 1 : 0) + 1;
    while (rows.length > 1 && cost() > MAX_LINES) rows = rows.slice(0, rows.length - 1);
    const rowLines = rows.map(tableRow);
    if (rows.length < rowTarget) rowLines.push(`+${rowTarget - rows.length} older requests not shown`);
    // The fence is part of the report: the command renders this verbatim and
    // the columns only line up inside it.
    return ["```", ...fixed, ...rowLines,
      "Round = one back-and-forth; each round re-sends the whole chat.", "```"].join("\n");
  } catch (err) {
    return `Token summary unavailable: ${err && err.message}`;
  }
}

if (require.main === module) {
  const { resolveVaultPath } = require("./vault-log.js");
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? +argv[i + 1] : dflt;
  };
  const kind = argv.includes("--days") ? "days" : "last";
  const days = Math.max(1, opt("--days", 7) || 7);
  const maxPrompts = Math.max(1, opt("--last", DEFAULT_ROWS) || DEFAULT_ROWS);
  // Read only as much as the window needs, never below the historical floor.
  // A days window can span far more entries than a request window, so it
  // always scans to the ceiling.
  const limit = kind === "days" ? SCAN_CEIL : Math.min(SCAN_CEIL, Math.max(SCAN_FLOOR, 8 * maxPrompts));
  const positional = argv.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  process.stdout.write(getTokensSummary(resolveVaultPath(positional[0]), { kind, days, maxPrompts, limit }) + "\n");
}

module.exports = { getTokensSummary, parseLine };