---
description: Restore session context from memory
---

!`git status --short`
!`git diff --stat`

If `.opencode/memory/decisions.md` and `.opencode/memory/errors.md` exist
in this project, summarize them — even though their content may already
be silently in context (auto-loaded via this project's `instructions`
config), this command's job is to surface it as an explicit, readable
digest, not just have it sitting unread in the background. If they don't
exist, skip that part silently — don't treat their absence as an error.

Those files hold the newest 25 entries; older ones live in the sibling
`*_archive.md` (never auto-loaded). Don't read the archive directly — use
`memory.js recall "<keywords>"`, which searches the live files and the
archive together.

Then run `node "$env:USERPROFILE\.config\opencode\scripts\memory.js" brief` (user profile +
this project's wip next action; no MCP). For a specific area, follow with
`memory.js recall "<keywords>"` instead of reading vault files.

List open todos and next steps. $ARGUMENTS
