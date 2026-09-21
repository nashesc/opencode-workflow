---
description: Review the session and log decisions/errors to memory
---

Run the full session-end review. $ARGUMENTS

## Step 1 — Gather session context

**Session start file:** Read `.opencode/.session-start` if it exists. It contains
two lines: ISO timestamp (line 1) and git HEAD SHA at session start (line 2, or
`no-commits`). If the file doesn't exist, note "session start unknown."

**Git commits:** Run `git log --oneline`. If a session-start SHA is available,
scope to commits after it: `git log --oneline <start-sha>..HEAD`. If git reports
no commits yet or the range is empty, skip git candidates. If session start is
unknown, use the last 20 commits as the scope.

**Already-logged items:** Read `.opencode/.session-manual-logs` if it exists.
These entries were logged during the session via `/log-decision` or `/log-error`
and must be excluded from candidates to avoid duplicates. Store them as a list.

**Pending test errors:** Read `.opencode/.pending-test-errors` if it exists.
Each line is a pre-formatted error candidate (`YYYY-MM-DD — ...`).

**Pending hook errors:** Read `.opencode/.pending-hook-errors` if it exists.
Each line is a pre-formatted error candidate (`YYYY-MM-DD — ...`).

## Step 2 — Generate candidates

From the gathered context, build a deduplicated candidate list. For each source:

- **Git commits:** For each commit in scope, decide if it represents a notable
  decision (architectural, non-obvious, or worth remembering) or a resolved error.
  Skip trivial commits (typos, formatting, version bumps). Generate one candidate
  entry per notable commit in format `YYYY-MM-DD — summary — rationale`.
  Mark type as DECISION or ERROR as appropriate.

- **Completed todos:** Scan your session memory for completed todos that aren't
  covered by the git commits above. Apply the same significance filter.

- **Pending test errors:** Each line is already formatted — include as-is, type ERROR.

- **Pending hook errors:** Each line is already formatted — include as-is, type ERROR.

**Deduplication:** Drop any candidate whose summary is substantially the same as
an entry in `.session-manual-logs`. Substring match is sufficient.

If zero candidates remain after deduplication, output:
```
Nothing new to log this session. Session bookkeeping cleaned up.
```
Then go directly to Step 4 (cleanup) and Step 5 (hook offer).

## Step 3 — Approval loop (one-by-one)

Present each candidate in turn. Use this exact format for each:

```
─────────────────────────────────────────────
Candidate [N of M]:

  Suggested type:  DECISION  (or ERROR)
  Entry:           2026-09-20 — summary — rationale
  Source:          git commit abc1234 / completed todo / test failure / hook failure

Options:
  (d) Log as decision
  (e) Log as error
  (s) Skip this candidate
  (q) Quit — stop reviewing, leave remaining candidates unlogged
  Or type an edited entry line, then follow with (d) or (e).
─────────────────────────────────────────────
```

Wait for the user's response for each candidate before moving to the next.

**On (d):** Write to `.opencode/memory/decisions.md` (prepend after header) and
mirror to `OpenCode/Decisions.md` in the Obsidian vault, following the exact same
procedure as `/log-decision` including the vault archive check (count >50 → archive
oldest entries to `OpenCode/Decisions_archive.md`). Also append the entry to
`.opencode/.session-manual-logs`.

**On (e):** Write to `.opencode/memory/errors.md` (prepend after header, format
`YYYY-MM-DD — summary — Status: Open — rationale`) and mirror to
`OpenCode/Errors.md` in the Obsidian vault, following the exact same procedure as
`/log-error` including the vault archive check. Also append the entry to
`.opencode/.session-manual-logs`.

**On (s):** Skip, move to the next candidate.

**On (q):** Stop immediately. Report how many were logged vs skipped vs remaining.

**Edited entry:** If the user types a modified entry line before (d)/(e), use
their version verbatim as the entry text.

After all candidates are processed (or (q)), print a summary:
```
Session review complete: N logged as decisions, M logged as errors, K skipped.
```

## Step 4 — Cleanup scratch files

Delete the following files if they exist (use PowerShell `Remove-Item`):
- `.opencode/.session-start`
- `.opencode/.session-manual-logs`
- `.opencode/.pending-test-errors`
- `.opencode/.pending-hook-errors`

## Step 5 — Git hook offer

Check whether `.git/hooks/pre-commit` exists in the current project AND is not
just a sample file (samples end in `.sample`).

If no active pre-commit hook exists: ask once:
```
No pre-commit hook found. Install a capture-only hook that records test failures
for /end-session review? It will never block commits. [y/N]
```

If the user answers y:
1. Create `.git/hooks/pre-commit` with this content (overwrite if exists):
   ```
   #!/bin/sh
   powershell.exe -NonInteractive -NoProfile -File "$USERPROFILE/.config/opencode/scripts/pre-commit.ps1"
   exit 0
   ```
2. On Windows/Git-for-Windows the sh.exe in Git's path handles this. Confirm:
   "Pre-commit hook installed at .git/hooks/pre-commit"

If the user answers N or skips: confirm "Hook not installed."

If a hook already exists: skip this offer entirely.
