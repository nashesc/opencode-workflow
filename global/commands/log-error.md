---
description: Append a new error, or update an existing entry's Status field, in errors.md
---

If `.opencode/memory/errors.md` doesn't exist yet in this project, create
it first with an `# Errors` heading and a one-line note that entries are
prepended at the top (newest first), auto-archived after 25 entries;
resolving one means editing its Status field in place, not moving or deleting it.

For a new error: prepend a new entry to `.opencode/memory/errors.md` (insert
immediately after header, before existing entries), format:
`YYYY-MM-DD — summary — Status: X — why`, for: $ARGUMENTS

For a Status update follow-up: search the file for the existing entry by
summary/date match, edit its Status field in place (newest-first order doesn't
affect this - grep still works).

After any write, check entry count using PowerShell helper:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Get-MemoryEntryCount ".opencode\memory\errors.md"
```

If count exceeds 25, invoke archive logic:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Invoke-MemoryArchive ".opencode\memory\errors.md" -Threshold 25
```

Then mirror a NEW error to durable global memory (file-direct, no MCP; dedupes,
tags the project, archives past 50). Status updates edit the project file only;
the vault copy is refreshed with `--supersede <id>` when the status matters
cross-project:
```powershell
node "$env:USERPROFILE\.config\opencode\scripts\memory.js" add error "<summary>" --why "<why>"
```
`DUP` = already stored. `SIMILAR <id>` = same failure seen before: `--supersede <id>`
to replace it with the newer detail, `--force` if distinct. Vault unreachable →
say so, never block the project write.

For new entries only (not Status updates): append the entry text (the one-line
`YYYY-MM-DD — summary — Status: X — why` string) to `.opencode/.session-manual-logs`
in the current project directory (create the file if it doesn't exist). This lets
`/end-session` exclude already-logged items from its candidate list to avoid duplicates.

Don't also touch this project's `opencode.jsonc` — if the project has
adopted this harness's template, `.opencode/memory/*.md` is already
wired to auto-load every session; nothing else needs configuring here.
