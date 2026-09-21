# OpenCode Harness v2 — Redesign Notes

Package contents: `global/` → copy into `~/.config/opencode/` (same layout
as before: `AGENTS.md`, `opencode.jsonc`, `agents/`, `skills/*/SKILL.md`,
`commands/`). `project/` → a **template**, not a fix for one project —
copy `AGENTS.md` and `opencode.jsonc` into any project's root, fill in
the placeholders, commit both.

---

## 1. Change summary

### Global — what changed and why

| Change | Reason |
|---|---|
| **Removed** the "check `.opencode/memory/` before making changes" prose rule from `AGENTS.md` | It only worked if the agent remembered to act on it every session. Replaced with a mechanical equivalent — see project `opencode.jsonc` below. This was the single biggest "relies on the model remembering" gap in the original set. |
| **Added** an explicit precedence section to `AGENTS.md` | The original only stated precedence for one rule (commit/push). Conflicts on anything else were unaddressed. Now stated once, generally: safety rules here win, everything else the project wins. |
| **Trimmed `reviewer.md` and `security.md` permission blocks** — later revised again, see §4 round 3 | Round 2 changed this further (deny-by-default instead of trimmed-delta) — this row describes the original round-1 state only; current behavior is documented below. |
| **Removed `tester.md`'s entire `bash` block** | Every single line was identical to global. Zero deltas. Kept `edit: ask` since that's a real override the implicit default doesn't cover. |
| **Fixed a real contradiction: `security.md`'s `webfetch: deny` → `ask`** | The `security-checklist` skill it loads explicitly requires checking dependencies against known CVEs — impossible to do with `webfetch` fully denied. This wasn't a style choice, it was a hard block on the agent doing part of its own job. |
| **`compaction.prune`: `false` → `true`, set explicitly** | Pruning drops stale tool-output text, not reasoning — low-risk, and reduces how often full auto-compaction has to run at all. Set explicitly rather than relying on the documented default, because there's a confirmed upstream bug where leaving it unset does *not* enable pruning despite what the docs say. |
| **`compaction.auto` — left at `true` (considered, rejected, disabling it)** | The prior findings doc's "never let it auto-compact" principle is right for an unattended loop, but doesn't port cleanly to interactive daily use: OpenCode's compaction toggle is global-only (no per-agent override exists yet), so disabling it would also hard-error every quick interactive session and every read-only subagent, not just a long autonomous run. Not a good trade. Addressed at the process level instead (small-scoped sessions; treat an observed compaction event as a "verify before trusting" signal) and documented as a known limitation rather than silently left alone. |
| **Skills (`review-checklist`, `security-checklist`, `test-pipeline`) — kept, near-unchanged** | Already well-designed: minimal, each explicitly defers to a project-level version of itself if one exists. Only real edit: added one line to `test-pipeline` making explicit that 100% coverage is not a default to aim for — a direct rejection of the source material's "100% coverage as standard" claim, which the finding doc flagged as overreach. |
| **Commands (`review`/`security`/`test`) — unchanged** | Already correctly force subagent dispatch via `subtask: true`, which structurally prevents these from ever running inline in the main Build context. Nothing to fix. |
| **`log-decision`/`log-error`/`recap` — lightly annotated, logic unchanged** | Added one line to each clarifying they don't need to touch `opencode.jsonc` themselves (that's now handled once, structurally, by the project template) and that `recap`'s value is the human-readable digest, not the raw read (which now happens automatically). |
| **JSON `command` block — confirmed absent, stays that way** | The prior project fix already found that a plural `"commands"` key in `opencode.jsonc` is silently ignored (OpenCode reads a singular `command` key). Rather than risk that mistake recurring, this redesign defines commands exclusively as markdown files under `commands/`, in both global and project scope — the whole failure class is structurally avoided, not just fixed once. |

### Project — what's new

| Addition | Reason |
|---|---|
| **`instructions: [".opencode/memory/*.md"]` in project `opencode.jsonc`** | This is the mechanical replacement for the prose rule removed from global `AGENTS.md`. `decisions.md`/`errors.md` are now unconditionally combined into every session's context if they exist — the agent doesn't have to decide to check them, and there's no failure mode where it forgets. Resolves to nothing (not an error) if the files don't exist yet, since it's a glob, not a literal path. |
| **A short, explicit note that `.opencode/memory/` must be committed, not gitignored** | Its entire value is durability across sessions and teammates. An easy thing to lose by default if someone's global gitignore template excludes tool-scratch directories. |
| **A documented, in-file example for adding a stack-specific permission override** (e.g. `pytest*`/`ruff*` allow) | Directly resolves the acknowledged JS/TS bias in the global bash allow-list, without bloating global config with every language's tooling. Deltas-only, because permission objects deep-merge with global — the project file doesn't need to restate anything it isn't changing. |
| **A documented override mechanism for agents/skills/commands** (same filename under `.opencode/` replaces the global version for that project) | This already worked in OpenCode; it just wasn't written down anywhere the agent or a future you would see it. Now it's explicit, with an explicit warning not to create a no-op override that's just a duplicate. |
| **Placeholder sections for project facts** (what it is, stack, architecture pointer, non-negotiables) | This is the one place project specifics belong, by design — global `AGENTS.md` explicitly refuses to assume a stack. |

### Explicitly rejected from the prior findings (with reasoning)

- **100% test coverage as a standard** — replaced with "coverage is a stage to run if a threshold is already configured; don't propose adding one as a default."
- **Disabling compaction outright** — see table above; the underlying concern is addressed at the process level instead, because the config mechanism to do it surgically doesn't exist yet in OpenCode.
- **A dedicated low-privilege "memory-writer" agent just for `log-decision`/`log-error`** — considered, rejected as unnecessary complexity for a two-line file append; the existing exposure (whatever the current primary agent's permissions are) is low-risk and the action is explicitly user-invoked.
- **Real concurrency/lock-file mechanism** — not built. Nothing in this redesign runs multiple parallel agents against the same project, so there's nothing for it to protect yet. Revisit only if that changes.
- **A fleet/board layer, a Ralph-style unattended loop script, visual-diff/Chrome DevTools MCP module** — all out of scope for this pass; none of the uploaded files implied unattended/autonomous operation, so none of that machinery was added speculatively.

---

## 2. Validation against the prior findings

Mapping each relevant finding from the earlier harness analysis to what this redesign actually does about it:

**"State lives on disk, not in chat"** → `decisions.md`/`errors.md` already did this; now they're also *mechanically* present in every session via `instructions`, not just present-if-remembered.

**"'Done' is machine-checked, never self-reported"** → Partially true, and the original version of this document overstated it. `reviewer`/`security` having `edit: deny` does mean they can't quietly "fix" what they find — but `/review`/`/security`/`/test` are callable commands, not gates. Nothing in OpenCode's own config stops a change from being called "done" without any of them running. The genuinely-enforceable version of "done" lives outside OpenCode: a git pre-commit hook running this project's lint/test, which actually blocks a commit on failure rather than just prompting for approval. Documented as an optional, recommended addition in the project template — not something OpenCode's config alone can provide.

**"Exit conditions are enumerated, not implicit" (P1 in prior doc)** → Not built here — out of scope, since nothing in this redesign runs an autonomous loop. Correctly deferred, not silently dropped: called out explicitly in the rejected-items list above.

**"Failures get promoted into the harness, not patched by hand"** → `log-decision`/`log-error` plus the now-automatic memory load *is* this mechanism at single-developer scale. No separate "retro" job was added — one promotion path (these two commands) is enough at this scale; a second one would have been the redundancy the source material itself was guilty of.

**"Convert advisory instructions into enforced permissions wherever possible" (P1 in prior doc)** → Directly applied: subagent `edit: deny`/`ask` blocks are the actual mechanism, not prose asking nicely. The commit/push gate is now explicitly documented as *permission-config-primary, prose-as-backup* rather than the reverse.

**"Verify global + project `AGENTS.md` composition actually works" (P0 in prior doc)** → Not re-litigated in the files themselves (that's a one-time runtime check, not a config change), but the precedence section added to global `AGENTS.md` gives you a concrete thing to test: ask the agent to state the precedence rule from memory in a fresh project session — if it can't, something isn't loading.

**"Path-scoped rules via `instructions` glob patterns" (P1 in prior doc)** → Applied, but for a different purpose than originally scoped (memory auto-load instead of path-scoped coding conventions) — the mechanism transferred, the use case that mattered most for this specific setup was memory, not per-directory rules. Nothing stops adding more `instructions` entries later for actual path-scoped conventions if a project needs them.

**"Redundant mechanisms — don't build two where one will do"** → Applied twice over: consolidated to one memory-promotion path (above), and removed literal duplicate permission lines across four files (`reviewer`, `security`, `tester`, plus the global file they all now correctly inherit from).

**"Reject 100% coverage / 'never use Plan mode' as absolutes"** → Coverage: rejected explicitly in `test-pipeline`. Plan mode: global `AGENTS.md`'s Plan-mode bullet now states the actual requirement ("write it to a file before switching to Build") instead of a blanket prohibition.

**"OpenCode's permission system is more granular than the repo's rule-file approach — use it"** → This is the throughline of nearly every agent-file change above: less prose, more `deny`/`ask` where OpenCode can actually enforce it.

---

## 3. Contradiction/gap check (explicit pass)

- **Commit/push gate vs. permission config**: consistent — both layers say `ask`, documented as intentionally redundant (pattern-matching can be routed around; the written rule is the backstop, not the reverse).
- **`security.md` webfetch vs. its own skill's CVE-check requirement**: was contradictory, fixed (§1).
- **Global `AGENTS.md`'s "never assume a stack" vs. global `opencode.jsonc`'s npm/bun/npx allow-list**: acknowledged, not silently left — documented as a deliberate JS-biased default with a stated, working escape hatch (project-level permission override), rather than pretended to be stack-agnostic.
- **`tester.md`'s own in-file note about non-JS friction vs. its former bash block re-asserting the JS bias anyway**: was mildly redundant/confusing (the note described project override as the fix while the block itself did nothing different from global), resolved by removing the redundant block — the note now accurately describes the only mechanism in play.
- **Project `instructions` array vs. any future global `instructions` array**: flagged explicitly in both `opencode.jsonc` files — arrays replace rather than merge in OpenCode's config system, unlike permission objects. Not currently a live conflict (global has no `instructions` array), but documented so it doesn't become a silent trap later.
- **Empty placeholder sections in the project template reading as real rules**: addressed directly in the template's own comments (explicit instruction to delete the non-negotiables section if unused, rather than leave it looking intentional).

No remaining contradictions found between the two files as shipped.

---

## 4. Revision log — external peer review (round 2)

This design was reviewed a second time by another model. Several findings
held up under verification and are now incorporated above and in the
shipped files; a few were checked and rejected. Full reasoning for each
is in the conversation, not repeated here — summary of what changed:

**Incorporated:**
- `reviewer`/`security` bash defaults flipped from inherited `ask` to
  explicit `deny` + a stated inspection allow-list — `edit: deny` alone
  doesn't stop a file write attempted via a bash one-liner.
- Restored a prose-backup rule for memory loading in global `AGENTS.md`
  (mirroring the existing commit-gate pattern) — the `instructions`-array
  mechanism has a real, independently-verified history of silently not
  reaching the model on some versions/providers.
- Added a verification note (V1 vs. V2 binary; which shell is actually
  executing bash commands, especially on Windows) at the top of global
  `opencode.jsonc` — OpenCode V2 uses an entirely different, incompatible
  permission schema, and Windows shell selection has a heavily-documented
  history of being inconsistent.
- Broadened the secret-file read-deny list (`*.pem`, `*.key`, `id_rsa*`,
  `*secrets*.json`) beyond just `.env`.
- Stated a canonical default for the tester non-JS override question
  (permission delta in project `opencode.jsonc` first; full agent-file
  override only when behavior, not just permissions, needs to differ).
- Added a memory-file format hint and an archival note for long-term
  context growth.
- Fixed a real JSONC comma trap in the project template's commented-out
  example block.
- Corrected the "done is machine-checked" claim above and added a
  git pre-commit hook as the actually-enforceable version of that idea.

**Checked and rejected:** an installer/version-check tool (out of
scope), reworking the commit-gate's pattern list (the gap is a ceiling
on pattern-matching permission systems generally, not fixable by adding
entries), a dedicated low-privilege memory-writer agent (already weighed
and rejected once with reasoning; no new information to revisit it), and
a claim that YAML frontmatter would reject unquoted `deny` values
(directly refuted — every file was parsed with `yaml.safe_load()` and
confirmed valid before and after).

## 5. Self-audit (round 3) — re-reading every file fresh, not from memory

Asked to re-check the design once more rather than assume round 2 closed
everything out. A full re-read of every shipped file (not a re-read of my
own summary of them) found four real issues that had crept in through
the round-2 edits themselves — none flagged by the external review,
because they were introduced *by* fixing that review's findings:

- **A broken internal cross-reference.** Global `AGENTS.md`'s commit-gate
  rule said it was "backed by the permission config below" — there is no
  permission config in that file; it's in `opencode.jsonc`. Fixed to
  reference the actual file.
- **A propagation gap.** `tester.md` still described the full-file
  override as a co-equal option for non-JS stacks, without the
  delta-first preference the project template had already established
  in round 2. The two files were giving inconsistent guidance for the
  same decision. Brought `tester.md` in line with the template.
- **An overbroad risk statement.** The Windows shell-verification comment
  implied all nine bash patterns were equally at risk of not matching.
  On inspection, only three are actually shell-syntax-dependent
  (`ls`/`grep`/`rm`, which have different native names on Windows);
  `git`/`npm`/`bun`/`npx`/`rg` are the same binary and syntax regardless
  of which shell spawns them. Narrowed the comment to name the three
  that actually need verifying, instead of casting doubt on all nine.
- **An unstated mitigation for a risk introduced by round 2 itself.**
  Flipping `reviewer`/`security` to deny-by-default (round 2, finding 3)
  combined with the Windows shell uncertainty (round 2, finding 4) meant
  a worst-case reading was "these agents could lose all bash-based
  inspection on Windows." Checked, and it's a non-issue in practice:
  OpenCode's native Read/Grep/Glob tools aren't gated by the `bash`
  permission block at all, so inspection still works even if every
  `ls`/`grep` bash invocation gets denied. Added this explicitly rather
  than leaving it as an implicit assumption.

**Checked and held up, not changed:** whether restoring the memory
prose-backup (round 2) re-introduces the "relies on the model to
remember" weakness the redesign was built to remove — no: it's a backup
behind a mechanical primary path, invoked only when that path is
unverified, not the primary mechanism itself, which is a different
category from what was removed. Whether project `AGENTS.md` and global
`AGENTS.md` now duplicate the memory-verification rule after round 2's
additions — no: global states the rule once, both project-level files
point back to it rather than restating it. Whether the `reserved: 8000`
compaction buffer needs tuning — no defensible number to change it to
without real usage data; left as an explicitly-disclosed non-decision
rather than a guess dressed up as a fix.
