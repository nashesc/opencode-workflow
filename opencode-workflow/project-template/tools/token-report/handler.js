"use strict";
const { totalTokens, formatTotalLine } = require("./tokens");

function safeLog(log, level, message) {
  try { if (typeof log === "function") log(level, message); } catch {}
}

function handleMessageUpdated(event, opts = {}) {
  const { log } = opts;
  try {
    const info = event && event.properties && event.properties.info;
    if (!info || typeof info !== "object") return { ok: false, reason: "malformed", line: formatTotalLine(null) };
    if (info.role !== "assistant") return { ok: false, reason: "non-assistant", line: formatTotalLine(null) };
    // Gate rule: a NON-ZERO total is self-evidently usable data, whether or not
    // the server sets time.completed (some builds never populate it). Zero or
    // missing snapshots are interim: skip silently (no line, no vault write, no
    // seen-mark) so a later event with real counts still gets processed. A
    // finished event whose tokens are missing/zero is a visible gap -> flag.
    const finished = !!(info.time && typeof info.time.completed === "number");
    const total = totalTokens(info.tokens);
    if (total === null && !finished) return { ok: false, reason: "interim" };
    if (total === null) {
      safeLog(log, "warn", `token-report: tokens unavailable session=${info.sessionID} msg=${info.id}`);
      return { ok: false, reason: "missing-tokens", sessionID: info.sessionID, messageID: info.id, line: formatTotalLine(null) };
    }
    if (total === 0 && !finished) return { ok: false, reason: "interim" };
    if (total === 0) {
      safeLog(log, "warn", `token-report: zero total on finished message session=${info.sessionID} msg=${info.id}`);
      return { ok: false, reason: "missing-tokens", sessionID: info.sessionID, messageID: info.id, line: formatTotalLine(null) };
    }
    const t = info.tokens;
    return {
      ok: true,
      sessionID: info.sessionID, messageID: info.id,
      model: `${info.providerID}/${info.modelID}`,
      total, line: formatTotalLine(total),
      vaultFields: { input: t.input, output: t.output, reasoning: t.reasoning, cacheRead: t.cache.read, cacheWrite: t.cache.write },
    };
  } catch (err) {
    safeLog(log, "warn", `token-report: handler-error ${err && err.message}`);
    return { ok: false, reason: "handler-error", line: formatTotalLine(null) };
  }
}

module.exports = { handleMessageUpdated };
