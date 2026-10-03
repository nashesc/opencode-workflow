"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_VAULT_FILE = null;
const HEADER = "# TokenUsage\n\nEntries are prepended at the top (newest first), auto-archived after 50 entries.\n\n";
const ENTRY_RE = /^\d{4}-\d{2}-\d{2}\s+[—-]/;
const MAX_ENTRIES = 50;

function resolveVaultPath(explicit) {
  return explicit || process.env.TOKEN_USAGE_PATH || path.join(os.homedir(), "Documents", "Obsidian Vault", "OpenCode", "TokenUsage.md");
}

function today() { return new Date().toISOString().slice(0, 10); }

function formatLine(r) {
  const f = r.vaultFields;
  return `${today()} — session:${r.sessionID} msg:${r.messageID} model:${r.model} total:${r.total} (in:${f.input} out:${f.output} reason:${f.reasoning} cache-read:${f.cacheRead} cache-write:${f.cacheWrite})`;
}

function readEntries(vaultPath) {
  let text;
  try {
    text = fs.readFileSync(vaultPath, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").filter((l) => ENTRY_RE.test(l.trim()));
}

function appendReport(report, vaultPath) {
  try {
    if (!report || report.ok === false || !report.vaultFields) return { ok: false, reason: "skip-not-written" };
    const p = vaultPath === undefined ? resolveVaultPath() : vaultPath;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let entries = [];
    try {
      const text = fs.readFileSync(p, "utf8");
      entries = text.split("\n").filter((l) => ENTRY_RE.test(l.trim()));
    } catch {
      entries = [];
    }
    entries.unshift(formatLine(report));
    let overflow = [];
    if (entries.length > MAX_ENTRIES) {
      overflow = entries.slice(MAX_ENTRIES);
      entries = entries.slice(0, MAX_ENTRIES);
    }
    fs.writeFileSync(p, HEADER + entries.join("\n") + "\n", "utf8");
    if (overflow.length > 0) {
      const archivePath = path.join(path.dirname(p), "TokenUsage_archive.md");
      let ahead = "";
      try { ahead = fs.readFileSync(archivePath, "utf8"); } catch { ahead = HEADER; }
      if (!ahead.includes("# TokenUsage")) ahead = HEADER + ahead;
      fs.writeFileSync(archivePath, ahead.replace(/\s+$/, "\n") + overflow.join("\n") + "\n", "utf8");
      return { ok: true, path: p, archived: overflow.length };
    }
    return { ok: true, path: p };
  } catch (err) {
    return { ok: false, reason: "vault-error" };
  }
}

module.exports = { appendReport, resolveVaultPath, readEntries, formatLine, MAX_ENTRIES };
