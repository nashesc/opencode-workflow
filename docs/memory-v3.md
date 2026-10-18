# Memory v3 (2026-10-18)

Goal: stop repeating preferences, constraints, and decisions across tasks and projects, without growing always-on context.

## Failures found → fix

| Failure | Fix |
|---|---|
| User prefs lived in vault `Context.md`, readable only via Obsidian MCP, which is off → never loaded | `memory.js sync` generates `~/.config/opencode/memory/profile.md` (≤40 lines), auto-loaded via global `instructions` |
| Vault was write-only: nothing retrieved it without MCP | `memory.js recall` (≤6 lines, cross-project) + `brief` |
| `/log-decision` + `/log-error` mirrored via MCP (off) → silently skipped; `/end-session` used a different path | Both use `memory.js add` |
| Corrections/preferences were never capture candidates (only commits, todos, test failures) | AGENTS.md Memory capture rule + `/end-session` PREF/CONSTRAINT candidates |
| No dedupe beyond first-60-chars; contradictions coexisted | Token-overlap dedupe, negation-flip conflict check, `--supersede` archives the old entry |
| Entries untagged/unlinked → orphan graph; `project.md`/`wip.md` basename collisions across projects | `#proj/<name>` tag + path-qualified hub links; `init` creates hubs; `sync` writes the index block; `lint` reports orphans/collisions |
| Obsidian protocol (~25% of AGENTS.md) described a disabled flow | Replaced with a shorter file-direct protocol (AGENTS.md 1551 → ~1330 est. tokens incl. new capability) |

## Data model
- User scope (vault): `Context.md` `## Preferences` / `## Constraints` → profile.md. Decisions/errors: `Decisions.md`, `Errors.md` (newest first, `#proj/<name>` + hub link).
- Project scope (git): `.opencode/memory/{decisions,errors,context}.md`.
- Archives (`*_archive.md`) never load. Superseded entries land there with `superseded <date> by <id>`.
- Entry format stays `YYYY-MM-DD — summary — why`, so MemoryHelpers/archive regex still match.

## Success criteria → status
| Criterion | Verified by |
|---|---|
| Pref added in one process is present in the next with no re-statement | `memory.test.js` (no-repetition test) |
| Exact dup skipped; negation-flip and overlap flagged, never silently stored | tests 3-6 |
| Supersede leaves exactly one active entry; old one archived | test 5 |
| Secrets/oversize rejected, nothing written | test 7 |
| Loaded profile ≤40 lines at any entry count; vault files cap at 50 | tests 10-11 |
| Index block idempotent; user text in Memory.md preserved; CRLF preserved | tests 14-15 |
| Skills structurally valid, descriptions ≤1600 chars total | `skills.test.js` |
| Existing suites unchanged | `pre-commit.test.js`, token-report tests |
| OpenCode actually loads profile.md and honors the permission rules | **manual, below** |
| Model follows the capture/recall protocol | **manual, below** |

## Manual checks (need a live OpenCode session)
1. `memory.js add pref "<something>"`, then new session: ask "quote your user profile". It must match.
2. `opencode debug config` in a project: merged `instructions` must list concise, clarify, profile.md, and the three project files. If only project entries show, arrays replace: repeat the global three in the project file.
3. Say "always use pnpm". Expect one permission prompt for `memory.js add`; approve; new session shouldn't ask again.
4. `memory.js lint` after a week: orphans, untagged entries, similar pairs.

### Results on 2026-10-18 (OpenCode v2.0.26, desktop app)
- (1) **PASS after restart.** Quoted verbatim from context, no file read.
- (2) **Arrays replace — confirmed.** A project `instructions` array fully replaces the global one, so the global `concise.md` / `clarify.md` / `profile.md` never reach a project that declares its own. Absolute paths work fine; `~/` expansion is untested. The project must repeat the global entries.
- (3) not run yet.
- Two traps that cost three failed sessions, both silent:
  - **`instructions` is snapshotted at server start.** Creating `profile.md` or editing an instructions list changes nothing until the server restarts. Watchers exist for `AGENTS.md` and `skills/` only — not for `opencode.jsonc`. So the very first `sync` must be followed by a restart before it can be verified.
  - A **missing** instruction file is dropped silently; there is no error.

## Known gaps
- **No delete:** `add|recall|brief|init|sync|lint` cannot remove an entry. Removing one means `--supersede` (which archives the old text but leaves the replacement) or a hand edit of the vault file.
- **Hand-written prefs are invisible (hit on 2026-10-18):** `parseEntry` only accepts `YYYY-MM-DD — text`, so undated bullets already in a vault `Context.md` yield zero entries — `sync` reports `profile: no entries` and `lint` stays silent (it only counts lines outside Preferences/Constraints). Migrate such prefs with `memory.js add pref`; do not hand-edit.
- `/end-session` wip/project note writes still need MCP or manual edit; `memory.js init` creates the stubs only.
- Similarity is token overlap, not semantic: paraphrased contradictions can slip through.
- PowerShell scripts (`MemoryHelpers.psm1`, `Mirror-Memory.ps1`) are untested here. `Mirror-Memory.ps1` is now unused; remove after one clean week.
