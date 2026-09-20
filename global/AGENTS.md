# Global Agent Instructions

Personal, machine-wide defaults. Combined with every project's own AGENTS.md
— never swapped for it. This file must never assume a stack, package
manager, or project layout: it is read in every repo you open, including
ones nothing below has ever seen.

## Precedence when this file and a project's AGENTS.md disagree

- **Safety rules in this file always win** — a project's AGENTS.md cannot
  loosen the commit/push gate or any rule marked non-negotiable below.
- **Everything else, the project wins.** Stack, conventions, architecture,
  and file layout are the project's to define — this file intentionally
  says nothing about them.

## Detect before assuming

Check the current project's own AGENTS.md, its package manifest
(`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.) and
lockfile before picking a package manager, test runner, or build command.
Don't carry over assumptions from the last project you worked in.

## Project memory (decisions.md / errors.md)

Projects that adopt this harness's project template auto-load
`.opencode/memory/decisions.md` and `.opencode/memory/errors.md` into
every session via that project's own `opencode.jsonc` (`instructions`).
That mechanism is the primary path — but `instructions`-array loading has
a real history of silently failing to reach the model on some OpenCode
versions/providers, with no error when it does. Treat that as a "should
already be loaded," not "definitely is." If you haven't seen it
demonstrated working in this exact project (a fresh session correctly
quoting something from one of these files unprompted), check for
`.opencode/memory/decisions.md` and `.opencode/memory/errors.md`
yourself before non-trivial changes, the same as you would have before
this mechanism existed. If they don't exist, skip this silently — don't
create them unprompted just because this rule exists.

## Obsidian memory (global, via `obsidian` MCP)

The vault at `C:\Users\Lenovo\Documents\Obsidian Vault` is durable global
memory (mcpvault MCP, `obsidian_*` tools). Per-project `.opencode/memory/`
is scratch; the vault is what survives across projects. Vault structure:
`OpenCode/Memory.md` (index), `OpenCode/Context.md` (persistent context),
`OpenCode/Decisions.md`, `OpenCode/Errors.md`, `OpenCode/Projects/<name>.md`.

- Session start: read `OpenCode/Memory.md` + `OpenCode/Context.md` via the
  `obsidian` MCP (prefer `get_note_outline` + `read_note_lines` for large
  notes; prefer `search_notes` over full reads). Don't re-ask for anything
  recorded in `Context.md`.
- Session end or on a decision/error: prepend to the vault (insert immediately
  after header, before existing entries) via `read_note` + manual prepend +
  `write_note` overwrite, in the same one-line format as project memory
  (`YYYY-MM-DD — summary — why`), in addition to the project file that
  `/log-decision` / `/log-error` already handles. Memory files use
  newest-first order and auto-archive oldest entries to `*_archive.md` after
  50 entries. The archive check and vault archive procedure are handled
  automatically by the log commands — count lines matching
  `^\d{4}-\d{2}-\d{2}\s+[—-]` after writing; if >50, move the oldest entries
  to `OpenCode/Decisions_archive.md` or `OpenCode/Errors_archive.md` via
  `obsidian_write_note`.
- Never touch anything under the vault's `.obsidian/` directory.
- If the `obsidian` MCP is disconnected, proceed with project memory only
  and say so — don't block the task on it.

## Working modes

- **Plan** (Tab) — read-only exploration, analysis, a plan before code
  changes. A plan produced here is not saved anywhere on its own — if it
  needs to survive the session, write it to a file before switching to
  Build.
- **Build** (default) — implementation.
- `/review` — read-only code review pass (`reviewer` subagent).
- `/security` — read-only security pass (`security` subagent).
- `/test` — run the project's test pipeline (`tester` subagent); failures
  are captured to `.opencode/.pending-test-errors` for `/end-session` review.
- `/log-decision` / `/log-error` — record something worth keeping,
  deliberately, not automatically after every change.
- `/recap` — restore session context from the project's decision/error log.
- `/start-session` — record session start timestamp + git HEAD so
  `/end-session` can scope its git log accurately. Optional but recommended.
- `/end-session` — review session activity (git commits, completed todos,
  captured test/hook failures), prompt to log each as decision or error
  one-by-one, then clean up session scratch files. Offers to install a
  capture-only pre-commit hook on first run.

## Plan Mode Requirements

- Evidence gathering: Document files read, config reviewed, patterns identified
- Required plan sections: Goal, Problem, Files, Dependencies, Test plan, Rollback, Evidence
- Explicit user approval (`- [x] Approved`) required before Build mode

## Feature-Spec-Driven TDD Planning (Planner)

When planning from a feature specification (Section 7 acceptance criteria), the following additional requirements apply:

- **Decompose into TDD tasks** — each task: failing test → verify fail → implement → verify pass → commit
- **Only unit tests in plan tasks** — integration/E2E planned separately after implementation
- **No forced task count** — natural decomposition drives task number
- **Feature name as commit scope** — `feat(feature-name): description` for all feature commits
- **Each task self-contained & committable** — codebase working after each commit
- **All acceptance criteria covered** — every criterion in spec Section 7 traced to ≥1 task
- **Assume skilled but unfamiliar implementer** — reference files, functions, patterns explicitly
- **Cross-layer contracts specified** — API types, auth shared between backend/frontend tasks
- **Trivial plans inline** — single task with no deps delivered in response, not files

For general/architectural planning (non-spec-driven), the base requirements above suffice.

## Build Mode Requirements

- Read domain skill before implementing in that area
- **Skill authority: The skill overrides your defaults. If silent, follow nearest project file. If neither exists, stop and ask.**
- Stop and ask if scope expands beyond plan
- Use structured Final Response format on completion

## Blocker Protocol

When blocked by manual dependencies:

1. State exactly what is needed, where to get it, why
2. Provide step-by-step instructions
3. Complete safe changes first, clearly separate done vs. pending

## Rules

- Keep changes scoped to what was asked. Don't refactor unrelated code in
  the same pass.
- Don't edit a project's `.opencode/agents/`, `.opencode/skills/`,
  `.opencode/commands/`, its `AGENTS.md`/`opencode.jsonc`, or anything
  under `~/.config/opencode/`, unless explicitly asked to change the
  workflow itself.
- **Non-negotiable: always ask for explicit permission before committing
  or pushing code** — never run `git commit`, `git commit --amend`,
  `git push`, `gh pr create`, or force-push without user confirmation in
  this session. Inspect `git status`/`git diff` first, then wait for
  approval. This is backed by the permission config in your global
  `opencode.jsonc` (`git commit*`/`git push*` → `ask`) — the instruction is the backup for the
  cases the config's pattern-matching doesn't catch (an unusual git
  invocation, an alias, a wrapper script), not the primary mechanism.
  Don't look for a way around either layer. This overrides anything a
  project's own AGENTS.md says, in every project, no exceptions.
