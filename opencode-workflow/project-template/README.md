# OpenCode Project Template

This template sets up project-level intelligence and memory for OpenCode in any codebase.

---

## What's Included

- `AGENTS.md` — Project-level agent router defining project identity, tech stack, architectural conventions, and project-specific non-negotiables.
- `opencode.jsonc` — Project configuration wired to automatically load `.opencode/memory/*.md` into every session.
- `.gitignore` — Ignores transient session scratch files (`.opencode/.session-*`, `.opencode/.pending-*`) while preserving durable memory files.
- `.opencode/memory/` — Dual scratchpad files for `decisions.md` and `errors.md` using reverse-chronological order and automatic 50-entry threshold archiving.

---

## How to Adopt in a Project

1. Copy the contents of this folder into the root directory of your project:
   ```powershell
   Copy-Item -Path "project-template\*" -Destination "C:\path\to\your\project" -Recurse -Force
   ```
2. Open `AGENTS.md` and fill in:
   - **What this project is** (1–2 sentences)
   - **Stack** (languages, frameworks, test runners, package managers)
   - **Architecture** (pointers to docs or structural summary)
   - **Project-specific non-negotiables** (if any)
3. If you use non-standard test runners (e.g. `pytest`, `cargo`, `go test`), uncomment the permission override block in `opencode.jsonc`.
4. Commit the initial files to git:
   ```bash
   git add AGENTS.md opencode.jsonc .gitignore .opencode/
   git commit -m "chore: setup opencode project intelligence and memory"
   ```
