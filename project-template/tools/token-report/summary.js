"use strict";
const fs = require("node:fs");
const ENTRY_RE = /^\d{4}-\d{2}-\d{2}\s+[—-]\s+(?:(\d{2}:\d{2}:\d{2})\s+)?(?:agent:(\S+)\s+)?session:(\S+)\s+msg:(\S+)\s+model:(\S+)\s+total:(\d+)\s+\(in:(\d+)\s+out:(\d+)\s+reason:(\d+)\s+cache-read:(\d+)\s+cache-write:(\d+)\)/;

function parseLine(line) {
  const m = ENTRY_RE.exec(line.trim());
  if (!m) return null;
  const [, time, agent, sessionID, messageID, model, total, input, output, reasoning, cacheRead, cacheWrite] = m;
  return { time: time || null, agent: agent || "unknown", sessionID, messageID, model, total: +total, input: +input, output: +output, reasoning: +reasoning, cacheRead: +cacheRead, cacheWrite: +cacheWrite, raw: line.trim() };
}

function getTokensSummary(vaultPath, { limit = 50 } = {}) {
  try {
    if (typeof vaultPath !== "string" || vaultPath.includes("\0")) throw new Error("invalid vault path");
    let text;
    try { text = fs.readFileSync(vaultPath, "utf8"); } catch { return "No token data yet."; }
    const entries = text.split("\n").map(parseLine).filter(Boolean).slice(0, limit);
    if (entries.length === 0) return "No token data yet.";
    const totals = entries.map((e) => e.total);
    const sum = totals.reduce((a, b) => a + b, 0);
    const lines = entries.map((e) => `- ${e.raw}`);
    // Split view: legacy naive sum (trend continuity) + context vs generation.
    // context = in + cache-read (what the model saw); generation = out + reason
    // (the billed output driver). Hit rate = cache-read / context per response.
    const contexts = entries.map((e) => e.input + e.cacheRead);
    const ctxSum = contexts.reduce((a, b) => a + b, 0);
    const freshSum = entries.reduce((a, e) => a + e.input, 0);
    const genSum = entries.reduce((a, e) => a + e.output + e.reasoning, 0);
    const hitRates = contexts.map((c, i) => (c > 0 ? entries[i].cacheRead / c : null)).filter((r) => r !== null);
    const hitAvg = hitRates.length > 0 ? hitRates.reduce((a, b) => a + b, 0) / hitRates.length : null;
    const missCount = contexts.filter((c, i) => c > 0 && entries[i].cacheRead / c < 0.05).length;
    const footer = [`count: ${entries.length}`, `grand total: ${sum} tokens (legacy naive sum, trend only)`,
      `avg: ${(sum / entries.length).toFixed(1)} tokens/response`,
      `min: ${Math.min(...totals)} / max: ${Math.max(...totals)}`,
      `context avg: ${(ctxSum / entries.length).toFixed(1)} (fresh-in avg: ${(freshSum / entries.length).toFixed(1)}, cache-read avg: ${(entries.reduce((a, e) => a + e.cacheRead, 0) / entries.length).toFixed(1)})`,
      hitAvg === null ? `cache-hit avg: n/a (${missCount} misses)` : `cache-hit avg: ${(hitAvg * 100).toFixed(1)}% (${missCount}/${entries.length} misses <5% hit)`,
      `generation total: ${genSum} tokens (out+reasoning, billed driver)`,
      `note: total=in+out+reason+cache-read+cache-write; context=in+cache-read; cross-check: opencode stats --days 7`];
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
