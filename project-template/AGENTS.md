# Project Agent Instructions

Project-specific facts and rules. Combined with global `AGENTS.md` at `~/.config/opencode/AGENTS.md`. Global safety rules win on conflicts.

## What this project is
<!-- One or two sentences: what it does, who/what it serves. -->

## Stack
<!-- Package manager, language/framework, canonical scripts location. Global AGENTS.md detects from manifest/lockfile; leave blank to save a detection pass. -->

## Architecture
<!-- Keep short — this file is a router, not the architecture doc. Point elsewhere if a longer doc exists. -->

## Project-specific non-negotiables
<!-- Add rules beyond global only. Delete this section if none. -->

## Memory
`.opencode/memory/decisions.md`, `errors.md`, `context.md` auto-loaded via `opencode.jsonc` (`instructions`). Decisions/errors: `date — summary — why`; context: `## Preferences` / `## Constraints` bullets (recurring requirements = constraints). Write via `memory.js add` (global AGENTS.md → Memory), which dedupes and supersedes. Tracked in git — don't gitignore `.opencode/memory/`. Archives (`*_archive.md`) never auto-load. Two traps verified 2026-10-18: a project `instructions` array REPLACES the global one (so it repeats the global entries, and needs a server restart before edits take effect).

## Enforcing "done"
`/review`, `/security`, `/test` are callable, not gates. Real enforcement: git pre-commit hook running lint/test, composing with commit approval. Add hook if "done" needs stronger meaning than "agent said so."

## Project-level overrides
Override global agents/skills/commands via same-named files under `.opencode/agents/`, `.opencode/skills/`, or `.opencode/commands/`. Reserve for behavioral differences. Full-file override stops inheriting global fixes; use `opencode.jsonc` for stack-specific allow-lists.