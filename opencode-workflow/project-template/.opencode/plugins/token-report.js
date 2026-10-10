import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

// File debug log, env-gated (app.log proved unreliable as an observability
// channel). Set TOKEN_REPORT_DEBUG_FILE to a writable path to get one JSON
// object per line: hook invocations with pull/pending/source outcomes.
// Unset (default) writes nothing. Never throws, never touches the vault.
function debugLine(obj) {
  try {
    const f = process.env.TOKEN_REPORT_DEBUG_FILE;
    if (!f) return;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify({ ts: Date.now(), ...obj }) + "\n");
  } catch {}
}

function loadTracker(root) {
  const base = path.join(root, "tools", "token-report");
  return {
    handleMessageUpdated: require(path.join(base, "handler.js")).handleMessageUpdated,
    appendReport: require(path.join(base, "vault-log.js")).appendReport,
    resolveVaultPath: require(path.join(base, "vault-log.js")).resolveVaultPath,
  };
}

export const TokenReport = async (ctx) => {
  const recorded = new Map(); // messageID -> last recorded total (last-wins, idempotent vault writes)
  const log = async (level, message) => {
    try { await ctx.client.app.log({ body: { service: "token-report", level, message } }); } catch {}
  };
  // Vault log only. No footer injection, no session.message pulls, no
  // polling: text.complete footer path removed (render-finalization race,
  // per-message vault churn). /tokens reads the vault log via summary.js.
  const dispatch = (eventName) => async (event) => {
    try {
      const root = ctx?.directory ?? process.cwd();
      const { handleMessageUpdated, appendReport, resolveVaultPath } = loadTracker(root);
      const r = handleMessageUpdated(event, { log: (l, m) => log(l, m) });
      if (!r || !r.ok) {
        debugLine({ hook: eventName, ok: false, reason: r && r.reason });
        return;
      }
      // Last-wins: a newer event with different totals overwrites (streaming
      // interim -> final). Identical redelivery (dual subscription) is skipped
      // so the vault never gets duplicate lines.
      if (recorded.get(r.messageID) === r.total) return;
      recorded.set(r.messageID, r.total);
      if (recorded.size > 1000) recorded.clear();
      try { appendReport(r, resolveVaultPath()); } catch (e) { await log("warn", `vault write failed: ${e?.message}`); }
      await log("info", `tokens:${r.total} session=${r.sessionID} msg=${r.messageID}`);
      debugLine({ hook: eventName, ok: true, sessionID: r.sessionID, messageID: r.messageID, total: r.total });
    } catch (e) { await log("warn", `event failed: ${e?.message}`); }
  };
  return {
    event: async (input) => { await dispatch("message.updated")((input && input.event) || null); },
    "message.updated": dispatch("message.updated"),
  };
};
