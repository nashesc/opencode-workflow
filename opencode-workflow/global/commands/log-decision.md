---
description: Append an architectural decision to decisions.md
---

If `.opencode/memory/decisions.md` doesn't exist yet in this project,
create it first with a `# Decisions` heading and a one-line note that
entries are prepended at the top (newest first), auto-archived after 50 entries.

Then prepend a new entry to `.opencode/memory/decisions.md` (insert
immediately after header, before existing entries), format:
`YYYY-MM-DD — summary — why`, for: $ARGUMENTS

After writing, check entry count using PowerShell helper:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Get-MemoryEntryCount ".opencode\memory\decisions.md"
```

If count exceeds 50, invoke archive logic:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Invoke-MemoryArchive ".opencode\memory\decisions.md" -Threshold 50
```

Then mirror the same entry to durable global memory: prepend it to
`OpenCode/Decisions.md` in the Obsidian vault via the `obsidian` MCP
(`read_note` to get current content, manually prepend the new entry after
header, then `write_note` with mode overwrite). If the `obsidian` MCP is
disconnected, skip the vault mirror silently and say so.

After the vault write, count entries in the vault file: count lines in the
content matching the pattern `^\d{4}-\d{2}-\d{2}\s+[—-]`. If count > 50:
1. Read `OpenCode/Decisions.md` via `obsidian_read_note`
2. Keep the newest 50 entries (top 50 after the header section)
3. The rest (oldest) go to `OpenCode/Decisions_archive.md`:
   - If the archive exists (`obsidian_read_note` succeeds): append the oldest
     entries to the existing content, then `obsidian_write_note` with mode overwrite
   - If it doesn't exist: create it with header:
     `# Decisions Archive\n\nArchived entries (oldest first, append-only). This file is never auto-loaded.`
     followed by the archived entries, then `obsidian_write_note` with mode overwrite
4. Rewrite `OpenCode/Decisions.md` with just the header + newest 50 entries via
   `obsidian_write_note` with mode overwrite
5. Report: "Archived N entries from Decisions.md to Decisions_archive.md"

If any MCP step fails, log a warning and continue — never block the primary write.

Finally, append the entry text (the one-line `YYYY-MM-DD — summary — why` string)
to `.opencode/.session-manual-logs` in the current project directory (create the
file if it doesn't exist). This lets `/end-session` exclude already-logged items
from its candidate list to avoid duplicates.

Don't also touch this project's `opencode.jsonc` — if the project has
adopted this harness's template, `.opencode/memory/*.md` is already
wired to auto-load every session; nothing else needs configuring here.
