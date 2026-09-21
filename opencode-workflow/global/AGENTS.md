# Global Agent Instructions

Personal, machine-wide defaults + project AGENTS.md — never swapped. No stack/layout assumptions; read in every repo.

## Precedence
**Safety rules win** (commit/push gate, non-negotiables). **Project wins everything else** (stack, conventions, architecture, layout).

## Detect Before Assuming
Check project AGENTS.md, manifest (package.json, pyproject.toml, go.mod, Cargo.toml, etc.), lockfile before picking tools. No carried assumptions.

## Project Memory
Auto-load .opencode/memory/decisions.md + errors.md via opencode.jsonc (instructions). Primary but silently fails on some versions — treat as should load, not does load. If not proven working (fresh session quoting unprompted), check files yourself before non-trivial changes. Absent = skip silently.

## Obsidian Memory
Vault: C:\Users\Lenovo\Documents\Obsidian Vault (mcpvault MCP, obsidian_* tools). Per-project .opencode/memory/ = scratch; vault = durable. Structure: OpenCode/Memory.md, Context.md, Decisions.md, Errors.md, Projects/<name>.md.
- **Start**: read Memory.md + Context.md via MCP (outline+lines for large; search>full reads). Don't re-ask Context.md.
- **End/decision/error**: prepend to vault (after header) via read_note+manual prepend+write_note, format YYYY-MM-DD — summary — why, plus project /log-decision//log-error. Newest-first; auto-archive @50 entries (regex ^\d{4}-\d{2}-\d{2}\s+[—-] → Decisions_archive.md/Errors_archive.md via obsidian_write_note).
- Never touch .obsidian/. MCP down → project memory only, say so, don't block.

## Working Modes
- **Plan** (Tab) — read-only explore/analyze/plan → write to persist.
- **Build** (default) — implementation.
- /review — read-only code review (reviewer subagent).
- /security — read-only security pass (security subagent).
- /test — run project test pipeline (tester subagent); failures → .opencode/.pending-test-errors.
- /log-decision / /log-error — deliberate record, not automatic.
- /recap — restore context from project decision/error log.
- /start-session — record timestamp + git HEAD for /end-session scope (optional).
- /end-session — review commits/todos/failures → prompt log each → clean scratch → offer capture-only pre-commit hook.

## Plan Mode
Evidence: files read, config reviewed, patterns ID'd. Sections: Goal, Problem, Files, Dependencies, Test plan, Rollback, Evidence. Explicit approval (- [x] Approved) before Build.

## Feature-Spec TDD Planning
From spec Section 7:
- **Decompose TDD** — each: fail→verify→impl→verify→commit
- **Unit tests only** — E2E planned separately after
- **No forced count** — natural decomposition
- **Feature commit scope** — feat(name): description
- **Self-contained committable** — working after each commit
- **All criteria traced** — Section 7 → ≥1 task
- **Skilled-unfamiliar implementer** — explicit refs to files/functions/patterns
- **Cross-layer contracts** — API types, auth shared backend/frontend
- **Trivial plans inline** — response not files
Non-spec planning: base requirements suffice.

## Build Mode
Read domain skill first. **Skill overrides defaults; silent → nearest project file; neither → stop and ask.** Stop if scope expands. Structured Final Response on completion.

## Blocker Protocol
Blocked? 1) State need/where/why. 2) Step-by-step instructions. 3) Safe changes first, separate done/pending.

## Rules
- Scoped changes only — no unrelated refactors.
- No editing .opencode/agents|skills|commands, AGENTS.md/opencode.jsonc, ~/.config/opencode/ unless workflow change.
- **Non-negotiable: ask before commit/push** — never git commit/amend/push/gh pr create/force-push without confirmation. git status/diff first, wait. Backed by opencode.jsonc (commit*/push*→ask); this backs pattern gaps (alias, wrapper, unusual invocation). No circumvention. Overrides project AGENTS.md, no exceptions.
