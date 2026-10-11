// pre-commit.js -- capture-only git hook for the OpenCode memory system.
//
// Portable equivalent of pre-commit.ps1 (which remains as a fallback for
// machines without node). Detects the project's test/lint command from its
// manifest, runs it, and on failure appends up to 3 failure summaries to
// .opencode/.pending-hook-errors for /end-session to capture.
// Gitleaks soft-gate: runs `gitleaks protect --staged` when installed,
// warns once and skips otherwise. NEVER exits non-zero.
//
// Installed by /end-session when the user opts in.
// Usage (also handy standalone): node pre-commit.js   (cwd anywhere in repo)

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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

  // Gitleaks soft-gate: runs on every commit regardless of project type.
  if (onPath("gitleaks")) {
    let g;
    try {
      g = spawnSync("gitleaks", ["protect", "--staged", "--verbose", "--no-git"], { encoding: "utf8", shell: process.platform === "win32" });
    } catch (e) {
      g = { status: 1, stdout: "", stderr: "Error running gitleaks: " + String((e && e.message) || e) };
    }
    const gCode = !g || g.status === null || g.status === undefined ? 1 : g.status;
    let gOut = ((g && g.stdout) || "") + "\n" + ((g && g.stderr) || "");
    if (g && g.error) gOut += "\nError running gitleaks: " + g.error.message;
    if (gCode !== 0) {
      const lines = gOut.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
      for (const l of lines.length ? lines : ["gitleaks reported findings (no detail captured)"]) {
        append(stamp + " \u2014 Pre-commit hook: gitleaks found possible secret \u2014 " + l);
      }
    }
  } else {
    console.log("pre-commit: gitleaks not installed, secret scan skipped (winget install gitleaks to enable)");
  }

  const t = detect(root);
  if (!t) return 0;
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
  if (code === 0) return 0;
  const lines = out.split(/\r?\n/);
  let fails = lines.filter((l) => /FAIL|FAILED|Error|error|✗|×|●|\bfailed\b/.test(l)).slice(0, 3);
  if (!fails.length) fails = lines.map((l) => l.trim()).filter(Boolean).slice(-3);
  if (!fails.length) fails = ["'" + t.label + "' exited " + code + " with no output"];
  for (const l of fails) {
    append(stamp + " \u2014 Pre-commit hook: " + t.label + " failed \u2014 " + l.replace(/\s+/g, " ").trim());
  }
  return 0;
}

try {
  process.exitCode = main() || 0;
} catch {
  process.exitCode = 0; // capture-only: never block a commit
}
