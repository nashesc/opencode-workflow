---
description: Append an architectural decision to decisions.md
---

If `.opencode/memory/decisions.md` doesn't exist yet in this project,
create it first with a `# Decisions` heading and a one-line note that
entries are prepended at the top (newest first), auto-archived after 25 entries.

Then prepend a new entry to `.opencode/memory/decisions.md` (insert
immediately after header, before existing entries), format:
`YYYY-MM-DD — summary — why`, for: $ARGUMENTS

After writing, check entry count using PowerShell helper:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Get-MemoryEntryCount ".opencode\memory\decisions.md"
```

If count exceeds 25, invoke archive logic:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Invoke-MemoryArchive ".opencode\memory\decisions.md" -Threshold 25
```

Then mirror to durable global memory (file-direct, no MCP; dedupes, tags the
project, archives past 50):
```powershell
node "$env:USERPROFILE\.config\opencode\scripts\memory.js" add decision "<summary>" --why "<why>"
```
Output `DUP` = already stored, fine. `SIMILAR <id>` = overlaps an older entry:
if this decision replaces it, rerun with `--supersede <id>`; if both stay valid,
`--force`; otherwise ask. Vault unreachable → say so, never block the project write.

Finally, append the entry text (the one-line `YYYY-MM-DD — summary — why` string)
to `.opencode/.session-manual-logs` in the current project directory (create the
file if it doesn't exist). This lets `/end-session` exclude already-logged items
from its candidate list to avoid duplicates.

Don't also touch this project's `opencode.jsonc` — if the project has
adopted this harness's template, `.opencode/memory/*.md` is already
wired to auto-load every session; nothing else needs configuring here.
