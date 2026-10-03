"use strict";
const fs = require("node:fs");
const ENTRY_RE = /^\d{4}-\d{2}-\d{2}\s+[—-]\s+session:(\S+)\s+msg:(\S+)\s+model:(\S+)\s+total:(\d+)\s+\(in:(\d+)\s+out:(\d+)\s+reason:(\d+)\s+cache-read:(\d+)\s+cache-write:(\d+)\)/;

function parseLine(line) {
  const m = ENTRY_RE.exec(line.trim());
  if (!m) return null;
  const [, sessionID, messageID, model, total, input, output, reasoning, cacheRead, cacheWrite] = m;
  return { sessionID, messageID, model, total: +total, input: +input, output: +output, reasoning: +reasoning, cacheRead: +cacheRead, cacheWrite: +cacheWrite, raw: line.trim() };
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
    const footer = [`count: ${entries.length}`, `grand total: ${sum} tokens`,
      `avg: ${(sum / entries.length).toFixed(1)} tokens/response`,
      `min: ${Math.min(...totals)} / max: ${Math.max(...totals)}`];
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
