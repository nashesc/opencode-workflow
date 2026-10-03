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
    totalTokens: require(path.join(base, "tokens.js")).totalTokens,
    formatTotalLine: require(path.join(base, "tokens.js")).formatTotalLine,
  };
}

export const TokenReport = async (ctx) => {
  const seen = new Set();
  const recorded = new Map(); // messageID -> last recorded total (last-wins, idempotent vault writes)
  const log = async (level, message) => {
    try { await ctx.client.app.log({ body: { service: "token-report", level, message } }); } catch {}
  };
  const dispatch = (eventName) => async (event) => {
    try {
      const root = ctx?.directory ?? process.cwd();
      const { handleMessageUpdated, appendReport, resolveVaultPath } = loadTracker(root);
      const r = handleMessageUpdated(event, { log: (l, m) => log(l, m) });
      if (!r || !r.ok) {
        if (r && r.reason === "missing-tokens" && r.messageID) {
          if (seen.has(r.messageID)) return;
          seen.add(r.messageID);
          pending.set(r.messageID, r.line); // visible flag, appended once by text.complete
        }
        debugLine({ hook: eventName, ok: false, reason: r && r.reason });
        return;
      }
      // Last-wins: a newer event with different totals overwrites (streaming
      // interim -> final). Identical redelivery (dual subscription) is skipped
      // so the vault never gets duplicate lines.
      if (recorded.get(r.messageID) === r.total) return;
      recorded.set(r.messageID, r.total);
      if (recorded.size > 1000) recorded.clear();
      seen.add(r.messageID);
      if (seen.size > 1000) seen.clear();
      try { appendReport(r, resolveVaultPath()); } catch (e) { await log("warn", `vault write failed: ${e?.message}`); }
      await log("info", `tokens:${r.total} session=${r.sessionID} msg=${r.messageID}`);
      debugLine({ hook: eventName, ok: true, sessionID: r.sessionID, messageID: r.messageID, total: r.total });
      pending.set(r.messageID, r.line);
    } catch (e) { await log("warn", `event failed: ${e?.message}`); }
  };
  const pending = new Map();
  const appended = new Set(); // messageIDs already footered: text.complete fires per PART
  return {
    event: async (input) => { await dispatch("message.updated")((input && input.event) || null); },
    "message.updated": dispatch("message.updated"),
    "experimental.text.complete": async (input, output) => {
      try {
        const id = input?.messageID;
        const sessionID = input?.sessionID;
        // Exactly-once per message. No id -> cannot attribute: leave untouched.
        if (!id || appended.has(id)) return;
        const root = ctx?.directory ?? process.cwd();
        const { totalTokens, formatTotalLine } = loadTracker(root);
        let line = null;
        let source = null;
        let pulls = 0;
        let lastPullError = null;
        const PULL_ATTEMPTS = 10;
        const PULL_DELAY_MS = 250;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const canPull = typeof ctx?.client?.session?.message === "function";
        const tryPull = async () => {
          try {
            pulls++;
            const res = await ctx.client.session.message({ path: { id: sessionID, messageID: id } });
            const pulled = res && res.data && res.data.info && res.data.info.tokens;
            const total = totalTokens(pulled);
            if (total > 0) { line = formatTotalLine(total); source = "pull"; return true; }
          } catch (e) { lastPullError = (e && e.message) || String(e); }
          return false;
        };
        // 1. One fresh pull: current server state beats anything cached.
        if (canPull) await tryPull();
        // 2. Pending collected from message.updated events is already mature:
        //    use it immediately instead of burning the poll window (a stale
        //    zero-pull must never delay a known-good total, and the delay may
        //    push the mutation past the client's render-finalization).
        if (!line && pending.has(id)) { line = pending.get(id); source = "pending"; }
        // 3. Otherwise poll for late maturity (text.complete fires per part
        //    BEFORE the final message.updated arrives). SDK totals only, never
        //    estimated; untouched text stays unmarked for a later part.
        for (let attempt = 1; attempt < PULL_ATTEMPTS && !line && canPull; attempt++) {
          await sleep(PULL_DELAY_MS);
          await tryPull();
        }
        debugLine({ hook: "text.complete", sessionID, messageID: id, pulls, lastPullError, pendingHad: pending.has(id), source });
        // 4. Nothing usable yet -> leave text untouched AND unmarked, so a later
        //    part can still append the matured total. Never a placeholder.
        if (!line) return;
        if (output && typeof output.text === "string") {
          output.text += `\n${line}`;
          appended.add(id);
          if (appended.size > 1000) appended.clear();
          await log("info", `footer appended from ${source} msg=${id}`);
        }
        pending.delete(id);
      } catch (e) { await log("warn", `text.complete failed: ${e?.message}`); }
    },
  };
};
