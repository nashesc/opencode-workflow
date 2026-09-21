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

Then, if the `obsidian` MCP is connected, also digest durable global
memory: read `OpenCode/Memory.md` + `OpenCode/Context.md` and summarize
`OpenCode/Decisions.md` / `OpenCode/Errors.md` (prefer `search_notes` /
`get_note_outline` + `read_note_lines` over full reads). Never re-ask for
anything recorded in `Context.md`. If the MCP is disconnected, skip the
vault part silently and say so.

List open todos and next steps. $ARGUMENTS
