---
description: Append a new error, or update an existing entry's Status field, in errors.md
---

If `.opencode/memory/errors.md` doesn't exist yet in this project, create
it first with an `# Errors` heading and a one-line note that entries are
prepended at the top (newest first), auto-archived after 50 entries;
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

If count exceeds 50, invoke archive logic:
```powershell
Import-Module "$env:USERPROFILE\.config\opencode\scripts\MemoryHelpers.psm1" -Force
Invoke-MemoryArchive ".opencode\memory\errors.md" -Threshold 50
```

Then mirror the same entry (or Status update) to durable global memory:
`OpenCode/Errors.md` in the Obsidian vault via the `obsidian` MCP (`read_note`
to get current content, manually prepend new entry or patch Status field in
place, then `write_note` overwrite or `patch_note`). If the `obsidian` MCP is
disconnected, skip the vault mirror silently and say so.

After the vault write, count entries in the vault file: count lines matching
the pattern `^\d{4}-\d{2}-\d{2}\s+[—-]`. If count > 50:
1. Read `OpenCode/Errors.md` via `obsidian_read_note`
2. Keep the newest 50 entries (top 50 after the header section)
3. The rest (oldest) go to `OpenCode/Errors_archive.md`:
   - If the archive exists (`obsidian_read_note` succeeds): append the oldest
     entries to the existing content, then `obsidian_write_note` with mode overwrite
   - If it doesn't exist: create it with header:
     `# Errors Archive\n\nArchived entries (oldest first, append-only). This file is never auto-loaded.`
     followed by the archived entries, then `obsidian_write_note` with mode overwrite
4. Rewrite `OpenCode/Errors.md` with just the header + newest 50 entries via
   `obsidian_write_note` with mode overwrite
5. Report: "Archived N entries from Errors.md to Errors_archive.md"

If any MCP step fails, log a warning and continue — never block the primary write.

For new entries only (not Status updates): append the entry text (the one-line
`YYYY-MM-DD — summary — Status: X — why` string) to `.opencode/.session-manual-logs`
in the current project directory (create the file if it doesn't exist). This lets
`/end-session` exclude already-logged items from its candidate list to avoid duplicates.

Don't also touch this project's `opencode.jsonc` — if the project has
adopted this harness's template, `.opencode/memory/*.md` is already
wired to auto-load every session; nothing else needs configuring here.
