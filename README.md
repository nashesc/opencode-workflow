# OpenCode Workflow

A modular, production-ready AI engineering harness for [OpenCode](https://opencode.ai). Provides a hierarchical configuration model (Global Defaults + Project Template), a specialized subagent swarm, a slash command suite, and a dual-layer hybrid auto-logging memory system with Obsidian Vault integration.

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │               Global Harness                 │
                        │           (~/.config/opencode/)              │
                        │  - Machine-wide non-negotiable safety gates   │
                        │  - 9 Specialized Subagents                   │
                        │  - 11 Slash Commands                         │
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
│   │   ├── publish-workflow.md        # /publish-workflow (sanitized sync to distro)
│   │   ├── recap.md                   # /recap (surfaces human-readable memory digest)
│   │   ├── review.md                  # /review (runs read-only code review)
│   │   ├── security.md                # /security (runs security audit)
│   │   ├── test.md                    # /test (runs test pipeline + error staging)
│   │   └── logo.md                    # /logo (logo design via logo-design skill)
│   ├── scripts/                       # PowerShell automation utilities
│   │   ├── MemoryHelpers.psm1         # Reverse-chronological prepend & project archive
│   │   ├── Publish-Workflow.ps1       # Distro sync worker (invoked by /publish-workflow)
│   │   ├── pre-commit.js              # Git pre-commit hook (portable; findings block)
│   │   ├── pre-commit.ps1             # Fallback hook for machines without node
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
│   ├── tools/token-report/            # Token-report helpers + node:test suite
│   └── .opencode/
│       ├── plugins/token-report.js    # Vault-log-only token totals (auto-discovered, no footer)
│       ├── commands/tokens.md         # /tokens on-demand usage summary
│       ├── package.json               # Plugin runtime deps (@opencode-ai/plugin)
│       └── memory/
│           ├── decisions.md           # Starter decision log
│           └── errors.md              # Starter error log
│
└── docs/                              # Historical design notes & architecture rationale
    └── harness-v2-redesign-notes.md
├── MANIFEST.md                        # Generated publish manifest (source map + HEAD refs)
```

---

## Key Features

### 1. Dual-Layer Memory Architecture
- **Project Memory (`.opencode/memory/`):** Tracked in git, auto-loaded on every session via `opencode.jsonc` (explicit `instructions` file list — never a `*.md` glob, so archive files stay unloaded). Uses reverse-chronological order (`YYYY-MM-DD — summary — why`) and auto-archives oldest entries after 50.
- **Global Vault Memory (Obsidian, file-direct):** Durable cross-project store (`OpenCode/Context.md` prefs + constraints, `Decisions.md`, `Errors.md`, `Projects/<name>/project.md` / `wip.md`, `Memory.md` index). Read and written by `scripts/memory.js` (no MCP, tested): `add` dedupes, flags contradictions, supersedes, rejects secrets, archives at 50; `recall` retrieves; `sync` regenerates the index block and `~/.config/opencode/memory/profile.md`, which is auto-loaded every session. Design, success criteria, and manual checks: `docs/memory-v3.md`.

### 2. Hybrid Auto-Logging & Session Lifecycle
- `/start-session` — Captures start time and initial git HEAD.
- `/test` — Automatically stages up to 3 failure summaries into `.opencode/.pending-test-errors`.
- `pre-commit.js` (portable; `pre-commit.ps1` fallback) — stages test failures to `.opencode/.pending-hook-errors` without blocking commits; a gitleaks finding blocks the commit.
- `/end-session` — Analyzes git commits, completed tasks, and staged errors; deduplicates against manual logs; presents candidates one-by-one for approval (`(d)ecision`, `(e)rror`, `(p)reference/constraint`, `(s)kip`, `(q)uit`, or inline edit); cleans up scratch files; and offers to install the hook.

### 3. Subagent Swarm
- **Skills:** `build-verify` (criteria + evidence before "done"), `debugging`, `frontend-verify`, plus `review-checklist`, `test-pipeline`, `security-checklist`, `web-research`.
- **Planner & Reviewers:** Decomposes complex feature specs into committable TDD tasks. Specialized domain subagents (`database-engineer`, `architecture-reviewer`, `ux-architect`, `dx-advocate`, `project-expert`, `reviewer`, `security`, `tester`) collaborate to deliver verified solutions.

### 4. Token Reporting Plugin (optional project-template feature)
- **Vault log only:** `.opencode/plugins/token-report.js` records real SDK token totals per assistant message (no footer injection, no polling).
- **Vault log:** newest-first `OpenCode/TokenUsage.md` (+ 50-entry archive), path overridable via `TOKEN_USAGE_PATH`.
- **On-demand summary:** `/tokens` (`.opencode/commands/tokens.md` → `tools/token-report/summary.js`) with bounded trends.
- **Tests:** `node --test "tools/token-report/*.test.js"` (node:test, no framework; the bare directory form fails — pass the glob). File-debug via `TOKEN_REPORT_DEBUG_FILE`.

### 5. Optional: logo-design skill
- Install separately (pinned `0ecf52e`, github.com/kaankiziltug/logo-design-skill) into `~/.config/opencode/skills/logo-design/` — it is ~14 MB with third-party trademarked SVGs, so the publisher never bundles it (multi-file skill dirs are skipped) and `/logo` ships the workflow only.
- Gate it with `"skill": { "logo-design": "ask" }` under `permission` in `opencode.jsonc`.

---

## Installation & Setup

### Step 1: Install Global Configuration
Copy the `global/` folder contents into your machine's OpenCode config directory:

```powershell
# Windows (PowerShell). Back up any existing config first -- -Force overwrites.
Copy-Item -Path "global\*" -Destination "$env:USERPROFILE\.config\opencode" -Recurse -Force
```

### Step 2: Configure API Keys & Obsidian MCP
Never paste keys into `opencode.jsonc`. Set persistent **User** environment
variables (Windows: Settings > environment variables, or `setx NAME "value"`),
then reference them — an unset variable resolves to an empty string, so
verify with `opencode models <provider>` after restarting OpenCode:
```jsonc
{
  "provider": {
    "my-gateway": {
      "options": { "baseURL": "https://gateway.example/v1", "apiKey": "{env:MY_GATEWAY_API_KEY}" }
    }
  },
  "mcp": {
    "obsidian": {
      "type": "local",
      "command": ["npx", "-y", "@bitbonsai/mcpvault@0.16.0", "C:\\path\\to\\your\\Obsidian Vault"],
      "enabled": true
    }
  }
}
```

Third-party gateways and free-model routers have their own Terms of Service
and data policies — traffic (including prompts) goes through them, not
directly to the model vendor. Review each provider's ToS before use;
`disabled_providers` in `opencode.jsonc` switches one off without deleting it.

Optional but recommended: `winget install gitleaks` — the pre-commit hook
blocks the commit on a secret-scan finding when it is present (test failures
stay capture-only) and skips with a notice when absent.

### Step 3: Adopt in Any Project
Copy `project-template/` into any new or existing project repository. Fill in `AGENTS.md` and commit.

---

## License
MIT
