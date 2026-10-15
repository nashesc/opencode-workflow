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
    // Observe (never record) user prompts: the plugin tracks the latest
    // user messageID per session and stamps subsequent assistant lines with
    // it, so /tokens can group steps per prompt. No vault write here.
    if (info.role === "user") return { ok: false, reason: "user-prompt", sessionID: info.sessionID, promptID: info.id };
    if (info.role !== "assistant") return { ok: false, reason: "non-assistant", line: formatTotalLine(null) };
    // Gate rule: record ONLY finished events (time.completed present).
    // Streaming interim snapshots — even with non-zero totals — are skipped
    // silently (no line, no vault write) so one message yields exactly one
    // vault line and /tokens never double-counts. A finished event whose
    // tokens are missing/zero is a visible gap -> flag.
    const finished = !!(info.time && typeof info.time.completed === "number");
    const total = totalTokens(info.tokens);
    if (!finished) return { ok: false, reason: "interim" };
    if (total === null) {
      safeLog(log, "warn", `token-report: tokens unavailable session=${info.sessionID} msg=${info.id}`);
      return { ok: false, reason: "missing-tokens", sessionID: info.sessionID, messageID: info.id, line: formatTotalLine(null) };
    }
    if (total === 0) {
      safeLog(log, "warn", `token-report: zero total on finished message session=${info.sessionID} msg=${info.id}`);
      return { ok: false, reason: "missing-tokens", sessionID: info.sessionID, messageID: info.id, line: formatTotalLine(null) };
    }
    const t = info.tokens;
    const ev = event && event.properties ? event : null;
    const agent = info.agent || info.agentName || (ev && ev.agent) || "main";
    const cost = typeof info.cost === "number" && Number.isFinite(info.cost) ? info.cost : null;
    return {
      ok: true,
      sessionID: info.sessionID, messageID: info.id,
      model: `${info.providerID}/${info.modelID}`,
      total, line: formatTotalLine(total),
      agent: String(agent),
      promptID: null, // stamped by the plugin from per-session last user prompt
      cost,
      at: new Date().toISOString(),
      vaultFields: { input: t.input, output: t.output, reasoning: t.reasoning, cacheRead: t.cache.read, cacheWrite: t.cache.write },
    };
  } catch (err) {
    safeLog(log, "warn", `token-report: handler-error ${err && err.message}`);
    return { ok: false, reason: "handler-error", line: formatTotalLine(null) };
  }
}

module.exports = { handleMessageUpdated };
