// pre-commit.js -- git hook for the OpenCode memory system.
//
// Portable equivalent of pre-commit.ps1 (which remains as a fallback for
// machines without node). Detects the project's test/lint command from its
// manifest, runs it, and on failure appends up to 3 failure summaries to
// .opencode/.pending-hook-errors for /end-session to capture. Test failures
// NEVER block the commit (exit stays 0 for those).
// Gitleaks gate: runs `gitleaks git --pre-commit --staged` when installed,
// warns once and skips otherwise. A real finding (exit 10) BLOCKS the commit;
// tool errors stay capture-only. Secret text is never written to logs.
//
// Installed by /end-session when the user opts in.
// Usage (also handy standalone): node pre-commit.js   (cwd anywhere in repo)

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Distinct exit code reserved for "gitleaks found leaks" so findings can be
// told apart from tool errors (gitleaks uses 1 for both leaks and errors).
const GITLEAKS_FINDINGS_CODE = 10;

function gitleaksArgs() {
  return ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "--exit-code", String(GITLEAKS_FINDINGS_CODE)];
}

// "clean" | "findings" | "error"
function classifyGitleaks(code) {
  if (code === 0) return "clean";
  if (code === GITLEAKS_FINDINGS_CODE) return "findings";
  return "error";
}

function gitRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, ".git")).isDirectory()) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function detect(root) {
  const has = (f) => { try { return fs.statSync(path.join(root, f)).isFile(); } catch { return false; } };
  if (has("package.json")) {
    let scripts = {};
    try { scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts || {}; } catch { return null; }
    const pm = has("bun.lockb") ? "bun" : "npm";
    if (scripts.test) return { cmd: pm, args: ["test", "--", "--passWithNoTests"], label: pm + " test" };
    if (scripts.lint) return { cmd: pm, args: ["run", "lint"], label: pm + " run lint" };
    return null;
  }
  if (has("pyproject.toml")) return { cmd: "pytest", args: ["--tb=short", "-q"], label: "pytest" };
  if (has("go.mod")) return { cmd: "go", args: ["test", "./..."], label: "go test ./..." };
  if (has("Cargo.toml")) return { cmd: "cargo", args: ["test"], label: "cargo test" };
  return null;
}

function onPath(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0;
}

function main() {
  const root = gitRoot(process.cwd());
  if (!root) return 0;
  const stamp = new Date().toISOString().slice(0, 10);
  const pending = path.join(root, ".opencode", ".pending-hook-errors");
  const append = (text) => {
    fs.mkdirSync(path.dirname(pending), { recursive: true });
    fs.appendFileSync(pending, text + "\n", "utf8");
  };

  // Gitleaks gate: runs on every commit regardless of project type.
  // Exit 10 (leaks) blocks the commit; any other non-zero is a tool error
  // and stays capture-only. One summary line is logged; secret text and
  // raw tool output are never written to the pending file.
  let blocked = false;
  if (onPath("gitleaks")) {
    let g;
    try {
      g = spawnSync("gitleaks", gitleaksArgs(), { encoding: "utf8", shell: process.platform === "win32", cwd: root });
    } catch (e) {
      g = { status: 1, stdout: "", stderr: "Error running gitleaks: " + String((e && e.message) || e) };
    }
    const gCode = !g || g.status === null || g.status === undefined ? 1 : g.status;
    const verdict = classifyGitleaks(gCode);
    if (verdict === "findings") {
      console.error("pre-commit: gitleaks found possible secret(s) in staged changes -- commit blocked");
      append(stamp + " \u2014 Pre-commit hook: gitleaks found possible secret(s) in staged changes \u2014 commit blocked");
      blocked = true;
    } else if (verdict === "error") {
      const gOut = ((g && g.stdout) || "") + "\n" + ((g && g.stderr) || "");
      if (g && g.error) gOut += "\nError running gitleaks: " + g.error.message;
      const first = gOut.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)[0]
        || ("gitleaks exited " + gCode);
      append(stamp + " \u2014 Pre-commit hook: gitleaks tool error (commit allowed) \u2014 " + first);
    }
  } else {
    console.log("pre-commit: gitleaks not installed, secret scan skipped (winget install gitleaks to enable)");
  }

  const t = detect(root);
  // No recognised manifest: skip tests, but a gitleaks finding still blocks.
  if (!t) return blocked ? 1 : 0;
  let out = "", code = 0;
  try {
    // shell on win32 so .cmd shims (npm, pytest) resolve; exact exec elsewhere.
    const r = spawnSync(t.cmd, t.args, { encoding: "utf8", cwd: root, shell: process.platform === "win32" });
    out = (r.stdout || "") + "\n" + (r.stderr || "");
    if (r.error) out += "\nError running '" + t.label + "': " + r.error.message;
    code = (r.status === null || r.status === undefined) ? 1 : r.status;
  } catch (e) {
    code = 1;
    out = "Error running '" + t.label + "': " + String((e && e.message) || e);
  }
  if (code === 0) return blocked ? 1 : 0;
  const lines = out.split(/\r?\n/);
  let fails = lines.filter((l) => /FAIL|FAILED|Error|error|✗|×|●|\bfailed\b/.test(l)).slice(0, 3);
  if (!fails.length) fails = lines.map((l) => l.trim()).filter(Boolean).slice(-3);
  if (!fails.length) fails = ["'" + t.label + "' exited " + code + " with no output"];
  for (const l of fails) {
    append(stamp + " \u2014 Pre-commit hook: " + t.label + " failed \u2014 " + l.replace(/\s+/g, " ").trim());
  }
  // Test failures stay capture-only; only gitleaks findings block.
  return blocked ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main() || 0;
  } catch {
    process.exitCode = 0; // never block on hook-internal errors
  }
} else {
  module.exports = { classifyGitleaks, gitleaksArgs, GITLEAKS_FINDINGS_CODE };
}
