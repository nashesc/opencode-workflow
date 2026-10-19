"use strict";
// context-budget.test.js -- guards the per-request context floor.
//
// The instruction files, the skill descriptions and the agent descriptions are
// re-sent with EVERY request, so they are a standing token cost that grows
// silently. This test fails when they pass their budget, when an archive file
// sneaks into the auto-loaded instructions list, and when a memory log stops
// being a bounded window.
//
// It measures bytes and characters, not tokens: those are exact, need no
// network, and do not drift when a tokenizer changes.
//
//   node --test scripts/context-budget.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG = path.join(__dirname, "..");
const PROJECT = process.cwd();

const INSTRUCTION_BUDGET = 25000;      // bytes, every auto-loaded instruction file
const SKILL_DESCRIPTION_BUDGET = 1600; // chars, all skill frontmatter descriptions
const AGENT_DESCRIPTION_BUDGET = 1200; // chars, all agent frontmatter descriptions
const MEMORY_ENTRY_BUDGET = 25;        // entries per auto-loaded memory log

const ENTRY_RE = /^\d{4}-\d{2}-\d{2}\s+[\u2014-]/;

function frontmatterDescription(file) {
  const t = fs.readFileSync(file, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
  if (!m) return null;
  const d = /^description:\s*(.*)$/m.exec(m[1]);
  return d ? d[1].replace(/^["']|["']$/g, "") : null;
}

function instructionsFrom(configFile) {
  if (!fs.existsSync(configFile)) return [];
  const t = fs.readFileSync(configFile, "utf8");
  const m = /"instructions"\s*:\s*\[([\s\S]*?)\]/.exec(t);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// The instruction set actually injected into a request: the two AGENTS.md
// files (global + project) plus every file named by an instructions array.
function instructionFiles() {
  const out = [path.join(CONFIG, "AGENTS.md")];
  for (const cfg of [path.join(CONFIG, "opencode.jsonc"), path.join(PROJECT, "opencode.jsonc")]) {
    for (const entry of instructionsFrom(cfg)) {
      const p = path.isAbsolute(entry) ? entry : path.resolve(PROJECT, entry);
      if (fs.existsSync(p) && !out.includes(p)) out.push(p);
    }
  }
  const projectAgents = path.join(PROJECT, "AGENTS.md");
  if (fs.existsSync(projectAgents) && !out.includes(projectAgents)) out.push(projectAgents);
  return out;
}

test("auto-loaded instruction files stay under budget", () => {
  const files = instructionFiles();
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(
    total <= INSTRUCTION_BUDGET,
    `instruction files total ${total} bytes (budget ${INSTRUCTION_BUDGET}): ` +
      files.map((f) => path.basename(f)).join(", ")
  );
});

test("archive files are never in the auto-loaded instructions list", () => {
  for (const cfg of [path.join(CONFIG, "opencode.jsonc"), path.join(PROJECT, "opencode.jsonc")]) {
    for (const entry of instructionsFrom(cfg)) {
      assert.ok(
        !/_archive\.md$/.test(entry),
        `${path.basename(cfg)} lists an archive file for auto-load: ${entry}`
      );
    }
  }
});

test("skill and agent descriptions stay under budget", () => {
  const skillsDir = path.join(CONFIG, "skills");
  const agentsDir = path.join(CONFIG, "agents");
  let skillChars = 0;
  if (fs.existsSync(skillsDir)) {
    for (const d of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const f = path.join(skillsDir, d.name, "SKILL.md");
      if (!fs.existsSync(f)) continue;
      const desc = frontmatterDescription(f);
      assert.ok(desc, `${d.name}: missing description`);
      skillChars += desc.length;
    }
  }
  let agentChars = 0;
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
      const desc = frontmatterDescription(path.join(agentsDir, f));
      assert.ok(desc, `${f}: missing description`);
      agentChars += desc.length;
    }
  }
  assert.ok(skillChars <= SKILL_DESCRIPTION_BUDGET, `skill descriptions total ${skillChars} chars (budget ${SKILL_DESCRIPTION_BUDGET})`);
  assert.ok(agentChars <= AGENT_DESCRIPTION_BUDGET, `agent descriptions total ${agentChars} chars (budget ${AGENT_DESCRIPTION_BUDGET})`);
});

test("auto-loaded memory logs stay a bounded window", () => {
  const memDir = path.join(PROJECT, ".opencode", "memory");
  if (!fs.existsSync(memDir)) return; // not a project with the memory harness
  for (const name of ["decisions.md", "errors.md"]) {
    const f = path.join(memDir, name);
    if (!fs.existsSync(f)) continue;
    const count = fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => ENTRY_RE.test(l.trim())).length;
    assert.ok(count <= MEMORY_ENTRY_BUDGET, `${name} holds ${count} entries (budget ${MEMORY_ENTRY_BUDGET}) - archive the oldest`);
  }
});
