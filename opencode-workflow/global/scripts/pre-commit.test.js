"use strict";
// pre-commit.test.js -- unit + integration tests for the gitleaks gate.
// Key-shaped strings are built at runtime so this file never contains a
// matchable secret (the publish sweep would redact it).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { classifyGitleaks, gitleaksArgs, GITLEAKS_FINDINGS_CODE } = require("./pre-commit.js");

describe("classifyGitleaks", () => {
  it("maps 0 to clean", () => assert.equal(classifyGitleaks(0), "clean"));
  it("maps the findings code to findings", () =>
    assert.equal(classifyGitleaks(GITLEAKS_FINDINGS_CODE), "findings"));
  for (const code of [1, 2, 126, 128]) {
    it(`maps ${code} to error`, () => assert.equal(classifyGitleaks(code), "error"));
  }
});

describe("gitleaksArgs", () => {
  it("uses the git pre-commit staged form with redact, no banner, distinct exit code", () =>
    assert.deepEqual(gitleaksArgs(), [
      "git", "--pre-commit", "--staged", "--redact", "--no-banner",
      "--exit-code", String(GITLEAKS_FINDINGS_CODE),
    ]));
  it("reserves a non-1 findings code (1 means tool error)", () =>
    assert.notEqual(GITLEAKS_FINDINGS_CODE, 1));
});

function hasBin(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0;
}

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hooktest-"));
  spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8" });
  return dir;
}

describe("hook integration (requires git + gitleaks)", { skip: !hasBin("git") || !hasBin("gitleaks") }, () => {
  it("exits 0 on a clean staged file", () => {
    const dir = mkRepo();
    fs.writeFileSync(path.join(dir, "note.txt"), "hello world\n");
    spawnSync("git", ["add", "note.txt"], { cwd: dir });
    const r = spawnSync(process.execPath, [path.join(__dirname, "pre-commit.js")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  });

  it("blocks (exit 1) on a staged fake key and never logs the secret", () => {
    const dir = mkRepo();
    // ghp-shaped token with enough entropy to trip generic-api-key.
    const fake = 'token = "ghp_' + "4F7K9Q2MD6XZ8HJ3WABCD4F7K9Q2MD6X" + '"\n';
    fs.writeFileSync(path.join(dir, "keys.txt"), fake);
    spawnSync("git", ["add", "keys.txt"], { cwd: dir });
    const r = spawnSync(process.execPath, [path.join(__dirname, "pre-commit.js")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr + r.stdout);
    const pending = fs.readFileSync(path.join(dir, ".opencode", ".pending-hook-errors"), "utf8");
    assert.match(pending, /commit blocked/);
    assert.doesNotMatch(pending, /ghp_/);
  });
});
