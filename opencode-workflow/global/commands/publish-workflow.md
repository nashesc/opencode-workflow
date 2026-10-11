---
description: Sync live workflow to the opencode-workflow distro, sanitized
agent: general
subtask: true
---

Sync the live workflow sources to the `opencode-workflow/` distro copy, sanitized. $ARGUMENTS

**Usage:**
- `/publish-workflow` — publish to the default dest root
- `/publish-workflow <dest-root>` — override dest root (`$1`). Also honors `$PUBLISH_DEST` env (`$1` wins).

**Default dest root:** `<WORKFLOW_DISTRO>`

**Procedure:**

1. Invoke the worker (pass through `$1` when given):
   ```powershell
   & "$env:USERPROFILE\.config\opencode\scripts\Publish-Workflow.ps1" -DestRoot "$1"
   ```
   (Omit `-DestRoot` when no override — the script falls back to `$env:PUBLISH_DEST`, then the default above.)

2. Source manifest (fixed list — no globs beyond the named exclusions):
   - `~/.config/opencode/AGENTS.md` → `<dest>/global/AGENTS.md`
   - `~/.config/opencode/commands/*.md` (excluding `*.bak`) → `<dest>/global/commands/`
   - `~/.config/opencode/agents/*.md` → `<dest>/global/agents/`
   - `~/.config/opencode/skills/*/SKILL.md` → `<dest>/global/skills/`
   - `~/.config/opencode/templates/*` → `<dest>/global/templates/`
    - `~/.config/opencode/scripts/*` (including `Publish-Workflow.ps1` itself, excluding `*.bak` and dev-only `*.test.ps1` corpus files) → `<dest>/global/scripts/`
    - `~/.config/opencode/opencode.jsonc` → `<dest>/global/opencode.jsonc` — **drift-guarded manual sync, never whole-file overwrite**: the distro file stays canonical for providers; the publisher fails closed if the carried sections (permissions, `subagent_depth`, MCP pins, `disabled_providers`, `small_model`, compaction, instructions) diverge from live — sync by hand, then re-run.
   - Workspace (`Default Project/` or current project root): `AGENTS.md`, `opencode.jsonc` (explicit-list hunk), `.opencode/commands/*`, `.opencode/plugins/token-report.js` → `<dest>/project-template/` mirror paths.
   - Never copied: `*.bak`, `node_modules/`, `.session-*`, `.pending-*`, `TokenUsage*.md`, `tools/`, `docs/`, vault content.

3. Sanitize (fail-closed — the script aborts before writing on any hit):
    - Live key sweep first: `$KEY_PATTERNS` (anchored, case-sensitive:
      `sk-…` incl. `sk-or-`/`sk-ant-`/`sk_live_`, `ghp_`/`gho_`/`github_pat_`/`ghs_`,
      `AIza`, `xoxb/p/a/s-`, `hf_`, `AKIA`) over live manifest sources —
      catches classes redaction would otherwise hide.
    - Live config rule: every `apiKey` in the live global `opencode.jsonc`
      must be an `{env:}`/`{file:}` indirection — literal keys block publish.
    - Staged redaction: matched keys → `<REDACTED>` (obviously invalid; never
      `{env:…}`, which substitutes to an empty string when unset).
   - Machine-specific home paths (`C:\Users\<name>`) → distro placeholder (`YOUR_OBSIDIAN_VAULT_PATH` / `<HOME>` per file convention).
   - Drop `*.bak`, session scratch files, token-usage logs.
   - Enforce explicit `instructions` file list (reject `*` globs that would auto-load archives).

4. First-run backfill (idempotent — each hunk guarded, rerun is a no-op):
   - `global/commands/plan.md`: ensure `$ARGUMENTS` block present.
   - `project-template/opencode.jsonc`: ensure explicit `[".opencode/memory/decisions.md", ".opencode/memory/errors.md"]` + archive comment.
   - `project-template/.opencode/plugins/token-report.js`: vault-log-only version (no `text.complete` footer path).
   - `README.md`: `instructions` glob wording → explicit list; Token Reporting footer bullets → vault-log-only (`/tokens` unchanged).

5. Report, don't commit: print `MANIFEST.md` summary plus `git status --short` / `git diff --stat` for the distro repo. **Never commit or push** — the user reviews the diff and commits separately.
