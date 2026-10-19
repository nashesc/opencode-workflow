# Project Agent Instructions

Project-specific facts and rules. Combined with global `AGENTS.md` at `~/.config/opencode/AGENTS.md`. Global safety rules win on conflicts.

## What this project is
<!-- one or two sentences: what it does, who/what it serves -->

## Stack
<!-- package manager, language/framework, canonical scripts location -->

## Architecture
<!-- router only — point to a longer doc if one exists -->

## Project-specific non-negotiables
<!-- rules beyond the global ones; delete this section if none -->

## Memory
`.opencode/memory/{decisions,errors,context}.md` auto-load every session via `opencode.jsonc` (`instructions`). Format: `date — summary — why`; context uses `## Preferences` / `## Constraints` bullets. Write via `memory.js add` (global AGENTS.md → Memory). Tracked in git — don't gitignore `.opencode/memory/`. The `instructions` list is explicit, never a `*.md` glob, so `*_archive.md` never auto-loads; the live files hold the newest 25 entries and `memory.js recall` still reaches the archive.

## Enforcing "done"
`/review`, `/security`, `/test` are callable, not gates. Real enforcement: a git pre-commit hook running lint/test, composing with commit approval. Add one if "done" needs to mean more than "agent said so".

## Project-level overrides
Override global agents/skills/commands via same-named files under `.opencode/agents/`, `.opencode/skills/`, or `.opencode/commands/`. Reserve for behavioral differences. A full-file override stops inheriting global fixes; use `opencode.jsonc` for stack-specific allow-lists.
