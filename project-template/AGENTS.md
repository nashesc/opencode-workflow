# Project Agent Instructions

Project-specific facts and rules. Combined with your global `AGENTS.md`
(`~/.config/opencode/AGENTS.md`) — this file doesn't repeat anything
already covered there: the stack-detection principle, the commit/push
gate, the working-modes index, or the harness-config edit restriction.
If anything here ever conflicts with a safety rule from the global file,
the global file wins (see its Precedence section).

## What this project is
<!-- One or two sentences: what it does, who/what it serves. -->

## Stack
<!-- Package manager + version, language(s)/framework(s), where the
canonical scripts live (package.json scripts, Makefile, justfile, etc).
Global AGENTS.md already tells the agent to detect this from your
manifest/lockfile if you leave this blank — filling it in just saves a
detection pass every session. -->

## Architecture
<!-- Keep this short — this file is a router, not the architecture doc.
Point elsewhere if a longer doc exists, e.g. "See docs/ARCHITECTURE.md". -->

## Project-specific non-negotiables
<!-- Only if this project has rules beyond the global ones — e.g. "never
hand-edit anything under /migrations", "this repo requires signed
commits", "changes under payments/ need a second reviewer pass before
approval is even asked for". Delete this section entirely if there are
none — an empty placeholder here reads as an intentional empty rule. -->

## Memory
`.opencode/memory/decisions.md` and `.opencode/memory/errors.md` (once
they exist) are auto-loaded into every session via this project's
`opencode.jsonc` (`instructions`) — see that file, including the note
about verifying that mechanism actually fires rather than assuming it.
They're tracked in git, not scratch output: don't gitignore
`.opencode/memory/`.

First entry in each file sets the format for everything after it — keep
it to one line per entry (date — one-line summary — why), so it stays
skimmable. Entries are prepended at the top (newest first), and
auto-archived to `decisions_archive.md` / `errors_archive.md` after 50 entries.

## Enforcing "done" (optional, recommended)
`/review`, `/security`, and `/test` are callable, not gates — nothing in
this harness actually stops a change from being called "done" without
any of them having run. OpenCode's own config has no hook for that. The
real enforcement point is a git pre-commit hook (installed via `/end-session`
or a custom `.git/hooks/pre-commit` script) that captures or validates
lint/test runs.

## Project-level overrides
This project can override any global agent, skill, or command by
creating a same-named file under `.opencode/agents/`, `.opencode/skills/`,
or `.opencode/commands/` — the project version replaces the global one
entirely, for this project only. Reserve this for when an agent's actual
*behavior* needs to differ (not just its permissions) — e.g. the tester's
whole approach on a stack the global prompt doesn't account for. For a
plain stack-specific bash allow-list (letting the tester run
`pytest`/`ruff`/etc. without asking every time), add a permission delta
to this project's `opencode.jsonc` instead — see that file. A full-file
override forks the entire agent definition and stops inheriting any
later fixes to the global version; don't reach for it just to fix an
allow-list.
