"use strict";
// Structural lint for skills: frontmatter valid, names match dirs, descriptions
// short (they sit in context every turn), bodies bounded. Does NOT prove the
// model follows them - that needs a live OpenCode session.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "skills");
const skills = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

function parse(name) {
  const t = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(t);
  assert.ok(m, `${name}: missing frontmatter`);
  const fm = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  return { fm, body: m[2] };
}

test("every skill has name === directory and a bounded description", () => {
  for (const s of skills) {
    const { fm } = parse(s);
    assert.equal(fm.name, s, `${s}: name must match directory`);
    assert.ok(fm.description.length >= 40 && fm.description.length <= 320, `${s}: description ${fm.description.length} chars`);
  }
});

test("skill bodies stay lean (<= 60 lines each)", () => {
  for (const s of skills) assert.ok(parse(s).body.trim().split("\n").length <= 60, `${s} too long`);
});

test("total skill-description budget stays small (<= 1600 chars)", () => {
  const total = skills.reduce((n, s) => n + parse(s).fm.description.length, 0);
  assert.ok(total <= 1600, `descriptions total ${total} chars`);
});

test("harness skills exist", () => {
  for (const s of ["build-verify", "debugging", "frontend-verify", "review-checklist", "test-pipeline", "security-checklist"]) assert.ok(skills.includes(s), s);
});
