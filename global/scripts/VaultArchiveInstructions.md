# Vault Archive Helper - Agent Instructions
# This file documents the procedure for archiving vault memory files via MCP tools.
# Agents should follow these steps when vault entry count exceeds threshold.

## Procedure: Archive Vault Memory File

**When to invoke:** After writing to vault memory file (Decisions.md or Errors.md), 
if entry count exceeds 50.

**Steps:**

1. **Read vault file and count entries:**
   ```
   obsidian_read_note -path "OpenCode/Decisions.md"
   ```
   Count lines matching: `^\d{4}-\d{2}-\d{2}\s+[—\u2014\-]`

2. **If count > 50, extract entries:**
   - Parse content into header (first 3 lines) and entry lines
   - Keep newest 50 entries (top 50 after header)
   - Archive oldest N entries (everything after entry 50)

3. **Check if archive file exists:**
   ```
   obsidian_read_note -path "OpenCode/Decisions_archive.md"
   ```
   (Will fail if doesn't exist - that's expected)

4. **Write to archive:**
   - If archive exists: append archived entries to existing content
   - If archive doesn't exist: create with header:
     ```
     # Decisions Archive
     
     Archived entries (oldest first, append-only). This file is never auto-loaded.
     
     [archived entries]
     ```
   - Use `obsidian_write_note -path "OpenCode/Decisions_archive.md" -content [full content] -mode overwrite`

5. **Rewrite live file:**
   - Reconstruct: header + newest 50 entries
   - Use `obsidian_write_note -path "OpenCode/Decisions.md" -content [new content] -mode overwrite`

6. **Log result:**
   - Report: "Archived N entries from Decisions.md to Decisions_archive.md"

**Graceful degradation:**
- If any MCP operation fails (disconnected), log warning and continue
- Never block primary memory write due to archive failure

**Example archive file names:**
- `OpenCode/Decisions.md` → `OpenCode/Decisions_archive.md`
- `OpenCode/Errors.md` → `OpenCode/Errors_archive.md`
