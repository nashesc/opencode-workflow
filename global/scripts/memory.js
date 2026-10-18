#!/usr/bin/env node
// memory.js - file-direct memory tool for the OpenCode harness. No MCP, no deps.
//
//   add <pref|constraint|decision|error> "<text>" [--why ..] [--scope user|project]
//       [--project name] [--supersede <id>] [--force]
//   recall "<query>" [--project name] [--limit 6] [--archive]
//   brief  [--project name]     user profile + project next action (<=40 lines)
//   init   [project]            create Projects/<name>/project.md + wip.md hubs (idempotent)
//   sync                        regenerate profile.md + Memory.md index block
//   lint                        orphans, collisions, duplicates, unmanaged lines
//
// Exit codes: 0 ok/skipped-duplicate, 1 error, 2 similar entry needs a decision
// (--supersede <id> or --force), 3 rejected (secret / too long).
//
// Env: OC_VAULT (vault "OpenCode" folder), OC_PROFILE (generated profile path).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const HOME = os.homedir();
const VAULT = process.env.OC_VAULT || path.join(HOME, "Documents", "Obsidian Vault", "OpenCode");
const PROFILE = process.env.OC_PROFILE || path.join(HOME, ".config", "opencode", "memory", "profile.md");

const ENTRY_RE = /^(?:[-*]\s+)?(\d{4}-\d{2}-\d{2})\s+[\u2014-]\s+(.*)$/; // matches the existing archive regex
const CAP = 50; // loaded decision/error files archive past this (same as MemoryHelpers)
const PROFILE_MAX_LINES = 40;
const MAX_LEN = 300;
const IDX_START = "<!-- memory-index:start -->";
const IDX_END = "<!-- memory-index:end -->";
const GENERATED = new Set(["User-level preferences and constraints. Managed sections feed profile.md.", "Project preferences and constraints. Auto-loaded; keep entries short."]);
const SECTIONS = { pref: "## Preferences", constraint: "## Constraints" };
const STOP = new Set("a an and are as at be by for from has have in into is it its of on or that the this to was we with when then than also should must can will".split(" "));
const NEG = /\b(not|never|no|don'?t|dont|avoid|stop|without|instead of)\b/i;
const SECRETS = [
  /sk-[A-Za-z0-9_-]{16,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{20,}/, /xox[baps]-[A-Za-z0-9-]{10,}/, /hf_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,}/i,
];

// ---------- text helpers ----------
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => s.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
const cleanName = (s) => s.replace(/[\[\]|#\\/]/g, "").trim();

function tokens(s) {
  const t = s.toLowerCase().replace(/\[\[[^\]]*\]\]|#[\w/.-]+/g, " ").replace(NEG, " ")
    .replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  return new Set(t);
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}
function parseEntry(line) {
  const m = ENTRY_RE.exec(line);
  if (!m) return null;
  const body = m[2].split(" \u00b7 ")[0].replace(/\s+\u2014\s+superseded .*$/, "");
  const id = crypto.createHash("sha1").update([...tokens(body)].sort().join(" ")).digest("hex").slice(0, 6);
  return { date: m[1], body, id, raw: line };
}
function judge(newBody, existing) {
  const nt = tokens(newBody), nNeg = NEG.test(newBody);
  for (const e of existing) {
    const j = jaccard(nt, tokens(e.body));
    if (NEG.test(e.body) !== nNeg && j >= 0.3) return { kind: "similar", e, why: "possible contradiction" };
    if (j >= 0.75) return { kind: "dup", e };
    if (j >= 0.5) return { kind: "similar", e, why: "overlaps" };
  }
  return { kind: "new" };
}

// ---------- file helpers (preserve BOM + line endings) ----------
function readDoc(p) {
  if (!fs.existsSync(p)) return { lines: [], eol: "\n", bom: "", exists: false };
  let t = fs.readFileSync(p, "utf8");
  const bom = t.charCodeAt(0) === 0xfeff ? "\ufeff" : "";
  if (bom) t = t.slice(1);
  const eol = t.includes("\r\n") ? "\r\n" : "\n";
  return { lines: t.split(/\r?\n/), eol, bom, exists: true };
}
function writeDoc(p, d) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (d.lines.length && d.lines[d.lines.length - 1] !== "") d.lines.push("");
  fs.writeFileSync(p, d.bom + d.lines.join(d.eol), "utf8");
}
const newDoc = (lines) => ({ lines, eol: "\n", bom: "", exists: false });

// Range of lines that hold entries: whole file, or one "## Section".
function scope(doc, section) {
  if (!section) return { start: 0, end: doc.lines.length };
  const h = doc.lines.findIndex((l) => l.trim() === section);
  if (h < 0) return null;
  let end = doc.lines.length;
  for (let i = h + 1; i < doc.lines.length; i++) if (/^#{1,6}\s/.test(doc.lines[i])) { end = i; break; }
  return { start: h + 1, end, heading: h };
}
function items(doc, section) {
  const r = scope(doc, section);
  if (!r) return [];
  const out = [];
  for (let i = r.start; i < r.end; i++) { const e = parseEntry(doc.lines[i]); if (e) out.push({ i, ...e }); }
  return out;
}
function insertTop(doc, section, line, title, blurb) {
  if (!doc.lines.length || (doc.lines.length === 1 && !doc.lines[0])) doc.lines = [`# ${title}`, "", blurb, ""];
  doc.lines = doc.lines.filter((l) => !/^\(No .* logged yet\.\)$/.test(l.trim()));
  if (section && !scope(doc, section)) {
    while (doc.lines.length && doc.lines[doc.lines.length - 1] === "") doc.lines.pop();
    doc.lines.push("", section, "");
  }
  const r = scope(doc, section);
  const first = items(doc, section)[0];
  if (!first && !section) {
    while (doc.lines.length && doc.lines[doc.lines.length - 1] === "") doc.lines.pop();
    doc.lines.push("", line);
    return;
  }
  doc.lines.splice(first ? first.i : r.heading + 1, 0, line);
}
function archiveTo(file, title, lines) {
  const d = readDoc(file);
  if (!d.exists) d.lines = [`# ${title} Archive`, "", "Archived entries (oldest first, append-only). This file is never auto-loaded.", ""];
  while (d.lines.length && d.lines[d.lines.length - 1] === "") d.lines.pop();
  d.lines.push(...lines.map((l) => l.replace(/^[-*]\s+/, "")), "");
  writeDoc(file, d);
}

// ---------- targets ----------
function projectName(a) { return cleanName(a.project || path.basename(process.cwd())); }
function target(type, a) {
  const proj = projectName(a);
  if (type === "decision" || type === "error") {
    const base = type === "decision" ? "Decisions" : "Errors";
    return { file: path.join(VAULT, `${base}.md`), section: null, title: base, blurb: `Entries are prepended at the top (newest first), auto-archived after ${CAP} entries.`, archive: path.join(VAULT, `${base}_archive.md`), cap: CAP, proj };
  }
  const sc = a.scope || (type === "pref" ? "user" : "project");
  if (sc === "project") {
    const dir = path.join(process.cwd(), ".opencode", "memory");
    return { file: path.join(dir, "context.md"), section: SECTIONS[type], title: "Context", blurb: "Project preferences and constraints. Auto-loaded; keep entries short.", archive: path.join(dir, "context_archive.md"), proj };
  }
  return { file: path.join(VAULT, "Context.md"), section: SECTIONS[type], title: "Context", blurb: "User-level preferences and constraints. Managed sections feed profile.md.", archive: path.join(VAULT, "Context_archive.md"), proj, user: true };
}
function hubLink(proj) {
  return fs.existsSync(path.join(VAULT, "Projects", proj, "project.md")) ? `[[Projects/${proj}/project|${proj}]] ` : "";
}

// ---------- commands ----------
function add(type, text, a) {
  if (!["pref", "constraint", "decision", "error"].includes(type)) return fail(1, "type must be pref|constraint|decision|error");
  text = (text || "").replace(/\s+/g, " ").trim();
  if (!text) return fail(1, "empty text");
  text = text.replace(/^\d{4}-\d{2}-\d{2}\s+[\u2014-]\s+/, "");
  if (text.length > MAX_LEN) return fail(3, `REJECTED: ${text.length} chars > ${MAX_LEN}. Shorten, or write a note and log a pointer.`);
  if (SECRETS.some((re) => re.test(text) || (a.why && re.test(a.why)))) return fail(3, "REJECTED: looks like a secret/credential. Never stored.");

  let body = text;
  if (type === "error" && !/Status:/i.test(body)) body += " \u2014 Status: Open";
  if (a.why) body += ` \u2014 ${a.why.replace(/\s+/g, " ").trim()}`;
  const t = target(type, a);
  const doc = readDoc(t.file);
  const list = items(doc, t.section).filter((e) => !t.proj || type === "pref" || type === "constraint" || !/#proj\//.test(e.raw) || e.raw.includes(`#proj/${slug(t.proj)}`));

  if (a.supersede) {
    const old = items(doc, t.section).find((e) => e.id === a.supersede);
    if (!old) return fail(1, `no entry with id ${a.supersede} in ${path.basename(t.file)}`);
    return commit(t, doc, body, type, old);
  }
  if (!a.force) {
    const v = judge(body, list);
    if (v.kind === "dup") return out(0, `DUP ${v.e.id} already in ${path.basename(t.file)}; skipped`);
    if (v.kind === "similar") return out(2, `SIMILAR ${v.e.id} (${v.why}): ${v.e.body.slice(0, 120)} | rerun with --supersede ${v.e.id} or --force`);
  }
  return commit(t, doc, body, type, null);
}
function commit(t, doc, body, type, old) {
  const bullet = t.section ? "- " : "";
  const meta = !t.section && t.proj ? ` \u00b7 ${hubLink(t.proj)}#proj/${slug(t.proj)}` : "";
  const line = `${bullet}${today()} \u2014 ${body}${meta}`;
  const newId = parseEntry(line).id;
  if (old) {
    doc.lines.splice(old.i, 1);
    archiveTo(t.archive, t.title, [`${old.raw} \u2014 superseded ${today()} by ${newId}`]);
  }
  insertTop(doc, t.section, line, t.title, t.blurb);
  if (t.cap) {
    const all = items(doc, t.section);
    if (all.length > t.cap) {
      const drop = all.slice(t.cap); // oldest sit at the bottom
      doc.lines = doc.lines.filter((_, i) => !drop.some((d) => d.i === i));
      archiveTo(t.archive, t.title, drop.map((d) => d.raw).reverse());
    }
  }
  writeDoc(t.file, doc);
  if (t.user || type === "decision" || type === "error") syncAll();
  return out(0, `ADDED ${newId} -> ${path.basename(t.file)}${old ? ` (superseded ${old.id})` : ""}`);
}

function profileText() {
  const doc = readDoc(path.join(VAULT, "Context.md"));
  if (!doc.exists) return null;
  const parts = ["# User profile (generated from vault Context.md; edit via memory.js add)"];
  let budget = PROFILE_MAX_LINES - 1;
  for (const sec of Object.values(SECTIONS)) {
    const its = items(doc, sec);
    if (!its.length || budget < 2) continue;
    parts.push(sec);
    for (const e of its.slice(0, budget - 1)) { parts.push(`- ${e.body}`); }
    budget -= 1 + Math.min(its.length, budget - 1);
  }
  return parts.length > 1 ? parts.join("\n") + "\n" : null;
}
function syncProfile() {
  const t = profileText();
  if (t === null) return "profile: no entries (Context.md missing or empty)";
  fs.mkdirSync(path.dirname(PROFILE), { recursive: true });
  fs.writeFileSync(PROFILE, t, "utf8");
  return `profile: ${t.trim().split("\n").length} lines`;
}
function syncIndex() {
  const links = ["- [[Context]]", "- [[Decisions]]", "- [[Errors]]"];
  const pdir = path.join(VAULT, "Projects");
  if (fs.existsSync(pdir)) {
    for (const n of fs.readdirSync(pdir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      if (fs.existsSync(path.join(pdir, n, "project.md"))) {
        const wip = fs.existsSync(path.join(pdir, n, "wip.md")) ? ` ([[Projects/${n}/wip|wip]])` : "";
        links.push(`- [[Projects/${n}/project|${n}]]${wip}`);
      }
    }
  }
  const block = [IDX_START, ...links, IDX_END];
  const f = path.join(VAULT, "Memory.md");
  const doc = readDoc(f);
  if (!doc.exists) doc.lines = ["# Memory", "", "Index of durable agent memory. The block below is generated by memory.js sync.", ""];
  const s = doc.lines.indexOf(IDX_START), e = doc.lines.indexOf(IDX_END);
  const before = doc.lines.join(doc.eol);
  if (s >= 0 && e > s) doc.lines.splice(s, e - s + 1, ...block);
  else { while (doc.lines.length && doc.lines[doc.lines.length - 1] === "") doc.lines.pop(); doc.lines.push("", ...block, ""); }
  if (doc.lines.join(doc.eol) !== before || !doc.exists) writeDoc(f, doc);
  return `index: ${links.length} links`;
}
function syncAll() { try { if (fs.existsSync(VAULT)) { syncIndex(); } syncProfile(); } catch (e) { process.stderr.write(`memory.js sync warning: ${e.message}\n`); } }

function sources(a) {
  const s = [];
  for (const f of ["Decisions", "Errors", "Context"]) s.push({ f: path.join(VAULT, `${f}.md`), kind: "entry" });
  const pdir = path.join(VAULT, "Projects");
  if (fs.existsSync(pdir)) for (const d of fs.readdirSync(pdir, { withFileTypes: true }).filter((x) => x.isDirectory())) for (const n of ["project", "wip"]) s.push({ f: path.join(pdir, d.name, `${n}.md`), kind: "note", proj: d.name });
  for (const f of ["decisions", "errors", "context"]) s.push({ f: path.join(process.cwd(), ".opencode", "memory", `${f}.md`), kind: "entry", local: true });
  if (a.archive) for (const f of ["Decisions", "Errors", "Context"]) s.push({ f: path.join(VAULT, `${f}_archive.md`), kind: "entry" });
  return s;
}
function recall(q, a) {
  const qt = tokens(q || "");
  if (!qt.size) return fail(1, "empty query");
  const limit = Math.min(Number(a.limit) || 6, 15);
  const proj = a.project ? cleanName(a.project) : path.basename(process.cwd());
  const hits = [];
  for (const s of sources(a)) {
    const d = readDoc(s.f);
    d.lines.forEach((line, i) => {
      const e = s.kind === "entry" ? parseEntry(line) : null;
      const txt = e ? e.body : s.kind === "note" && line.trim() && !/^(#|---|<!--)/.test(line.trim()) ? line.trim() : null;
      if (!txt) return;
      const lt = tokens(txt);
      let m = 0;
      for (const w of qt) if (lt.has(w)) m++;
      if (!m || (m < 2 && m / qt.size < 0.34)) return;
      let score = m / qt.size;
      if (s.proj === proj || line.includes(`#proj/${slug(proj)}`) || s.local) score += 0.2;
      hits.push({ score, date: e ? e.date : "", id: e ? e.id : "-", local: !!s.local, where: `${s.local ? ".opencode/memory/" : ""}${path.relative(VAULT, s.f).startsWith("..") ? path.basename(s.f) : path.relative(VAULT, s.f)}:${i + 1}`, txt });
    });
  }
  hits.sort((x, y) => y.score - x.score || y.date.localeCompare(x.date));
  if (!hits.length) return out(0, "no matches");
  const byId = new Map();
  for (const h of hits) {
    if (h.id === "-") continue;
    const cur = byId.get(h.id);
    if (!cur || (h.local && !cur.local)) byId.set(h.id, h);
  }
  const uniq = [];
  const taken = new Set();
  for (const h of hits) {
    if (h.id !== "-") {
      if (taken.has(h.id) || byId.get(h.id) !== h) continue;
      taken.add(h.id);
    }
    uniq.push(h);
  }
  return out(0, uniq.slice(0, limit).map((h) => `[${h.id}] ${h.where} ${h.txt.slice(0, 180)}`).join("\n"));
}
function brief(a) {
  const lines = [];
  const p = profileText();
  if (p) lines.push(p.trim());
  const proj = a.project ? cleanName(a.project) : path.basename(process.cwd());
  const wip = readDoc(path.join(VAULT, "Projects", proj, "wip.md"));
  const next = wip.lines.find((l) => /next/i.test(l) && !/^#/.test(l.trim()) && /\S/.test(l.includes(":") ? l.split(":").slice(1).join(":") : l));
  if (next) lines.push(`wip(${proj}): ${next.trim().slice(0, 160)}`);
  return out(0, lines.slice(0, PROFILE_MAX_LINES + 2).join("\n") || "no profile yet");
}

function init(name) {
  name = cleanName(name || path.basename(process.cwd()));
  if (!name) return fail(1, "empty project name");
  const d = path.join(VAULT, "Projects", name), made = [];
  const mk = (f, text) => {
    const p = path.join(d, f);
    if (fs.existsSync(p)) return;
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(p, text, "utf8");
    made.push(f);
  };
  mk("project.md", `# ${name}\n\nPurpose:\nStack:\nVerified commands:\nLast verified:\n\nIndex: [[Memory]] | Status: [[Projects/${name}/wip|wip]]\n`);
  mk("wip.md", `# ${name} wip\n\nObjective:\nStatus:\nBlockers:\nNext action:\n\nHub: [[Projects/${name}/project|${name}]]\n`);
  syncAll();
  return out(0, made.length ? `INIT ${name}: created ${made.join(", ")}` : `INIT ${name}: already exists`);
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== ".obsidian") walk(p, acc); } else if (d.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}
function lint() {
  const w = [];
  if (!fs.existsSync(VAULT)) return out(0, `WARN vault not found: ${VAULT}`);
  const files = walk(VAULT);
  const rel = files.map((f) => path.relative(VAULT, f).replace(/\\/g, "/").replace(/\.md$/, ""));
  const targets = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const m of t.matchAll(/\[\[([^\]|#]+)/g)) targets.add(m[1].trim().replace(/^OpenCode\//, ""));
  }
  const linked = (r) => targets.has(r) || targets.has(path.posix.basename(r)) && rel.filter((x) => path.posix.basename(x) === path.posix.basename(r)).length === 1;
  for (const r of rel) {
    if (/_archive$|^TokenUsage|^Memory$/.test(path.posix.basename(r))) continue;
    if (!linked(r)) w.push(`orphan: ${r} has no inbound link (run sync; link it from a hub)`);
  }
  const byBase = {};
  for (const r of rel) (byBase[path.posix.basename(r)] ||= []).push(r);
  for (const [b, v] of Object.entries(byBase)) if (v.length > 1) w.push(`basename collision: ${b} x${v.length}; link by path ([[${v[0]}|alias]]) never [[${b}]]`);
  const ctx = readDoc(path.join(VAULT, "Context.md"));
  if (ctx.exists) {
    const managed = new Set();
    for (const sec of Object.values(SECTIONS)) { const r = scope(ctx, sec); if (r) for (let i = r.heading; i < r.end; i++) managed.add(i); }
    const loose = ctx.lines.filter((l, i) => l.trim() && !/^#/.test(l.trim()) && !managed.has(i) && !GENERATED.has(l.trim()));
    if (loose.length) w.push(`Context.md: ${loose.length} line(s) outside Preferences/Constraints are NOT loaded into profile.md`);
    if (fs.existsSync(PROFILE) && fs.statSync(PROFILE).mtimeMs + 1000 < fs.statSync(path.join(VAULT, "Context.md")).mtimeMs) w.push("profile.md older than Context.md (run: memory.js sync)");
  }
  for (const n of ["Decisions", "Errors"]) {
    const its = items(readDoc(path.join(VAULT, `${n}.md`)), null);
    const untagged = its.filter((e) => !/#proj\//.test(e.raw)).length;
    if (untagged) w.push(`${n}.md: ${untagged} entr${untagged > 1 ? "ies" : "y"} without #proj/ tag (not retrievable by project)`);
    let pairs = 0;
    for (let i = 0; i < its.length && pairs < 3; i++) for (let j = i + 1; j < its.length && pairs < 3; j++) {
      if (jaccard(tokens(its[i].body), tokens(its[j].body)) >= 0.6) { w.push(`${n}.md: similar entries ${its[i].id} / ${its[j].id}; supersede or merge`); pairs++; }
    }
    if (its.length > CAP) w.push(`${n}.md: ${its.length} entries > ${CAP}`);
  }
  return out(0, w.length ? w.map((x) => `WARN ${x}`).join("\n") + `\nlint: ${w.length} warning(s)` : "lint: clean");
}

// ---------- plumbing ----------
function out(code, msg) { process.stdout.write(msg + "\n"); return code; }
function fail(code, msg) { process.stderr.write(msg + "\n"); return code; }
function parseArgs(argv) {
  const pos = [], a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      if (k === "force" || k === "archive") a[k] = true; else a[k] = argv[++i];
    } else pos.push(argv[i]);
  }
  return { pos, a };
}
function main(argv) {
  const { pos, a } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  try {
    switch (cmd) {
      case "add": return add(rest[0], rest.slice(1).join(" "), a);
      case "recall": return recall(rest.join(" "), a);
      case "brief": return brief(a);
      case "sync": return out(0, `${fs.existsSync(VAULT) ? syncIndex() : "index: vault missing"}; ${syncProfile()}`);
      case "init": return init(rest.join(" "));
      case "lint": return lint();
      default: return fail(1, "usage: memory.js add|recall|brief|init|sync|lint (see header of this file)");
    }
  } catch (e) { return fail(1, `memory.js error: ${e.message}`); }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, tokens, jaccard, judge, parseEntry };
