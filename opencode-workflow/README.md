# OpenCode AI Workflow & Harness

A modular, production-ready AI engineering harness for [OpenCode](https://opencode.ai). Provides a hierarchical configuration model (Global Defaults + Project Template), a specialized subagent swarm, a slash command suite, and a dual-layer hybrid auto-logging memory system with Obsidian Vault integration.

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │               Global Harness                 │
                        │           (~/.config/opencode/)              │
                        │  - Machine-wide non-negotiable safety gates   │
                        │  - 9 Specialized Subagents                   │
                        │  - 9 Slash Commands                          │
                        │  - Global Obsidian Vault Memory Protocol     │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │          Project-Level Template              │
                        │          (<project-root>/)                   │
                        │  - AGENTS.md (project router & context)      │
                        │  - opencode.jsonc (auto-load memory)         │
                        │  - .opencode/memory/ (local scratchpad)      │
                        └──────────────────────────────────────────────┘
```

### Precedence Rule
- **Safety rules in global `AGENTS.md` always win** (commit/push approval gates, security boundaries, non-negotiable permissions).
- **Stack, conventions, architecture, and project-level file layout are defined by each project's `AGENTS.md`.**

---

## Repository Structure

```
├── global/                            # Global configuration (copy to ~/.config/opencode/)
│   ├── AGENTS.md                      # Machine-wide agent instructions & memory protocols
│   ├── opencode.jsonc                 # Global config (permissions, providers, MCP setup)
│   ├── agents/                        # 9 Specialized subagents
│   │   ├── planner.md                 # TDD feature-spec implementation planner
│   │   ├── project-expert.md          # Codebase patterns, conventions, and data flows
│   │   ├── architecture-reviewer.md   # Architectural boundary & dependency validator
│   │   ├── database-engineer.md       # Schema design, migrations, and query patterns
│   │   ├── dx-advocate.md             # Developer experience, build & test infrastructure
│   │   ├── ux-architect.md            # Frontend UI/UX interaction contracts
│   │   ├── reviewer.md                # Read-only code review specialist
│   │   ├── security.md                # Read-only vulnerability & auth reviewer
│   │   └── tester.md                  # Test execution specialist
│   ├── commands/                      # Slash command definitions
│   │   ├── start-session.md           # /start-session (records start timestamp & git HEAD)
│   │   ├── end-session.md             # /end-session (session review, deduplicated triage)
│   │   ├── log-decision.md            # /log-decision (dual-write to project & vault memory)
│   │   ├── log-error.md               # /log-error (dual-write with status update support)
│   │   ├── plan.md                    # /plan (triggers planner subagent)
│   │   ├── recap.md                   # /recap (surfaces human-readable memory digest)
│   │   ├── review.md                  # /review (runs read-only code review)
│   │   ├── security.md                # /security (runs security audit)
│   │   └── test.md                    # /test (runs test pipeline + error staging)
│   ├── scripts/                       # PowerShell automation utilities
│   │   ├── MemoryHelpers.psm1         # Reverse-chronological prepend & project archive
│   │   ├── pre-commit.ps1             # Capture-only git pre-commit hook
│   │   └── VaultArchiveInstructions.md# MCP-based vault archive protocol
│   ├── skills/                        # Reusable domain skills
│   │   ├── review-checklist/SKILL.md  # Quality & architecture checklist
│   │   ├── security-checklist/SKILL.md# OWASP & auth security checklist
│   │   └── test-pipeline/SKILL.md     # Multi-stage test runner guide
│   └── templates/                     # Planning templates
│       ├── INDEX-FORMAT.md            # Plan index document structure
│       └── TASK-FORMAT.md             # TDD task document structure
│
├── project-template/                  # Ready-to-copy template for any repository
│   ├── README.md                      # Project setup instructions
│   ├── AGENTS.md                      # Project router template
│   ├── opencode.jsonc                 # Project config with memory auto-load
│   ├── .gitignore                     # Ignores session scratch files
│   └── .opencode/
│       └── memory/
│           ├── decisions.md           # Starter decision log
│           └── errors.md              # Starter error log
│
└── docs/                              # Historical design notes & architecture rationale
    └── harness-v2-redesign-notes.md
```

---

## Key Features

### 1. Dual-Layer Memory Architecture
- **Project Memory (`.opencode/memory/`):** Tracked in git, auto-loaded on every session via `opencode.jsonc` (`instructions: [".opencode/memory/*.md"]`). Uses reverse-chronological order (`YYYY-MM-DD — summary — why`) and auto-archives oldest entries after 50.
- **Global Vault Memory (Obsidian via MCP):** Durable knowledge repository surviving across projects (`OpenCode/Decisions.md`, `OpenCode/Errors.md`). Syncs automatically through MCP tools and auto-archives at the 50-entry threshold to `*_archive.md`.

### 2. Hybrid Auto-Logging & Session Lifecycle
- `/start-session` — Captures start time and initial git HEAD.
- `/test` — Automatically stages up to 3 failure summaries into `.opencode/.pending-test-errors`.
- `pre-commit.ps1` — Capture-only hook that stages test failures to `.opencode/.pending-hook-errors` without blocking commits.
- `/end-session` — Analyzes git commits, completed tasks, and staged errors; deduplicates against manual logs; presents candidates one-by-one for approval (`(d)ecision`, `(e)rror`, `(s)kip`, `(q)uit`, or inline edit); cleans up scratch files; and offers to install the capture hook.

### 3. Subagent Swarm
- **Planner & Reviewers:** Decomposes complex feature specs into committable TDD tasks. Specialized domain subagents (`database-engineer`, `architecture-reviewer`, `ux-architect`, `dx-advocate`, `project-expert`, `reviewer`, `security`, `tester`) collaborate to deliver verified solutions.

---

## Installation & Setup

### Step 1: Install Global Configuration
Copy the `global/` folder contents into your machine's OpenCode config directory:

```powershell
# Windows (PowerShell)
Copy-Item -Path "global\*" -Destination "$env:USERPROFILE\.config\opencode" -Recurse -Force
```

### Step 2: Configure API Keys & Obsidian MCP
Open `~/.config/opencode/opencode.jsonc` and configure your LLM providers and Obsidian vault path:
```jsonc
{
  "mcp": {
    "obsidian": {
      "type": "local",
      "command": ["npx", "-y", "@bitbonsai/mcpvault@latest", "C:\\path\\to\\your\\Obsidian Vault"],
      "enabled": true
    }
  }
}
```

### Step 3: Adopt in Any Project
Copy `project-template/` into any new or existing project repository. Fill in `AGENTS.md` and commit.

---

## License
MIT
