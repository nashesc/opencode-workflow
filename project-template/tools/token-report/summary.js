"use strict";
const fs = require("node:fs");
// prompt:/cost: groups are optional so legacy per-message lines (pre
// per-prompt format) still parse — each becomes its own single-step group.
const ENTRY_RE = /^\d{4}-\d{2}-\d{2}\s+[—-]\s+(?:(\d{2}:\d{2}:\d{2})\s+)?(?:agent:(\S+)\s+)?session:(\S+)\s+msg:(\S+)(?: prompt:(\S+))?(?: cost:([\d.]+))?\s+model:(\S+)\s+total:(\d+)\s+\(in:(\d+)\s+out:(\d+)\s+reason:(\d+)\s+cache-read:(\d+)\s+cache-write:(\d+)\)/;

function parseLine(line) {
  const m = ENTRY_RE.exec(line.trim());
  if (!m) return null;
  const [, time, agent, sessionID, messageID, promptID, cost, model, total, input, output, reasoning, cacheRead, cacheWrite] = m;
  return { time: time || null, agent: agent || "unknown", sessionID, messageID,
    promptID: promptID || null, cost: cost === undefined ? 0 : +cost,
    model, total: +total, input: +input, output: +output, reasoning: +reasoning,
    cacheRead: +cacheRead, cacheWrite: +cacheWrite, raw: line.trim() };
}

function getTokensSummary(vaultPath, { limit = 300, maxPrompts = 50 } = {}) {
  try {
    if (typeof vaultPath !== "string" || vaultPath.includes("\0")) throw new Error("invalid vault path");
    let text;
    try { text = fs.readFileSync(vaultPath, "utf8"); } catch { return "No token data yet."; }
    const entries = text.split("\n").map(parseLine).filter(Boolean).slice(0, limit);
    if (entries.length === 0) return "No token data yet.";
    // Group steps per prompt (newest-first by first appearance). Legacy lines
    // without prompt attribution each form their own single-step group.
    const groups = [];
    const byKey = new Map();
    for (const e of entries) {
      const key = e.promptID && e.promptID !== "unknown"
        ? `${e.sessionID} ${e.promptID}`
        : `${e.sessionID} msg:${e.messageID}`;
      let g = byKey.get(key);
      if (!g) { g = { key, prompt: e.promptID && e.promptID !== "unknown" ? e.promptID : e.messageID, head: e, steps: 0, total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, legacy: !e.promptID || e.promptID === "unknown" }; byKey.set(key, g); groups.push(g); }
      g.steps += 1;
      g.total += e.total; g.input += e.input; g.output += e.output; g.reasoning += e.reasoning;
      g.cacheRead += e.cacheRead; g.cacheWrite += e.cacheWrite; g.cost += e.cost;
    }
    const shown = groups.slice(0, maxPrompts);
    const lines = shown.map((g) => {
      const h = g.head;
      const when = h.time ? `${h.time} ` : "";
      return `- ${when}agent:${h.agent} session:${h.sessionID} prompt:${g.prompt} steps:${g.steps} model:${h.model} total:${g.total} (in:${g.input} out:${g.output} reason:${g.reasoning} cache-read:${g.cacheRead} cache-write:${g.cacheWrite}) cost:+${g.cost.toFixed(6)}`;
    });
    // Split view: legacy naive sum (trend continuity) + context vs generation.
    // context = in + cache-read (what the model saw); generation = out + reason
    // (the billed output driver). Hit rate = cache-read / context per line.
    // Per-prompt avgs use group sums; ungrouped counts lines with no prompt
    // attribution (legacy or pre-restart) — if it dominates, user-role events
    // aren't arriving and grouping is silently off.
    const lineCount = entries.length;
    const sum = entries.reduce((a, e) => a + e.total, 0);
    const genSum = entries.reduce((a, e) => a + e.output + e.reasoning, 0);
    const costSum = entries.reduce((a, e) => a + e.cost, 0);
    const hitRates = entries.map((e) => { const c = e.input + e.cacheRead; return c > 0 ? e.cacheRead / c : null; }).filter((r) => r !== null);
    const hitAvg = hitRates.length > 0 ? hitRates.reduce((a, b) => a + b, 0) / hitRates.length : null;
    const ungrouped = entries.filter((e) => !e.promptID || e.promptID === "unknown").length;
    const pctx = shown.map((g) => g.input + g.cacheRead);
    const pctxAvg = shown.length > 0 ? pctx.reduce((a, b) => a + b, 0) / shown.length : 0;
    const pfreshAvg = shown.length > 0 ? shown.reduce((a, g) => a + g.input, 0) / shown.length : 0;
    // Plain-language 4-line footer: readable with zero AI background.
    // Jargon map: fresh-in = brand-new input; cache-read/hit-rate =
    // re-reading earlier conversation from fast memory; generation = what
    // the assistant wrote; ungrouped = older entries from before per-prompt
    // grouping was switched on.
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const promptTotals = shown.map((g) => g.total);
    const model = shown.length > 0 ? shown[0].head.model : "n/a";
    const freshShare = pctxAvg > 0 ? Math.round((pfreshAvg / pctxAvg) * 100) : 0;
    const footer = [
      `In the last ${shown.length} requests you used about ${fmt(sum)} tokens (~${fmt(sum / lineCount)} per reply, ~${fmt(shown.reduce((a, g) => a + g.total, 0) / shown.length)} per request, smallest ${fmt(Math.min(...promptTotals))} / largest ${fmt(Math.max(...promptTotals))}).`,
      `Most of that was re-reading earlier conversation from fast memory, not new work — only about ${fmt(pfreshAvg)} tokens per request was brand-new input (${freshShare}% new, ${hitAvg === null ? "reuse rate unknown" : `about ${Math.round(hitAvg * 100)}% reused`}).`,
      `The assistant (${model}) wrote about ${fmt(genSum)} tokens total. Billed cost: $${costSum.toFixed(6)} on this model (check real spending with: opencode stats --days 7).`,
      `${lineCount - ungrouped} of ${lineCount} replies are neatly grouped per request; ${ungrouped} are older entries from before grouping was switched on. These numbers track trends, not bills.`];
    return [...lines, "", ...footer].join("\n");
  } catch (err) {
    return `Token summary unavailable: ${err && err.message}`;
  }
}

if (require.main === module) {
  const { resolveVaultPath } = require("./vault-log.js");
  process.stdout.write(getTokensSummary(resolveVaultPath(process.argv[2]), { limit: 50 }) + "\n");
}

module.exports = { getTokensSummary, parseLine };
