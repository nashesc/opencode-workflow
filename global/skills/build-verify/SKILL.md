---
name: build-verify
description: Set checkable success criteria before non-trivial coding, then prove each with command output before saying done. Load for features, fixes, refactors.
---

# Build and Verify

**Before coding**
- Restate the goal as 1-3 checkable criteria (a test, a command, an observable behavior). Consequential ambiguity -> ask (see clarify rule); trivial -> state the assumption, go.
- Check `.opencode/memory/` and `recall` output for constraints or decisions touching these files.

**While coding**
- Simplest change that meets the criteria. No speculative abstractions, options, or error handling for impossible cases.
- Touch only what the criteria need. Match existing style. Mention unrelated problems; don't fix them.
- Test first when a test runner exists: bug -> repro test that fails; feature -> acceptance test. No runner -> a runnable command that shows the behavior.

**Before "done"**
- Run scoped tests, then typecheck/lint (order per `test-pipeline`).
- Report each criterion with its evidence (command + result). "Should work" is not evidence.
- State what was NOT verified and why.

**Final report (<=8 lines):** criteria -> evidence; not verified; files changed; follow-ups.

**Memory:** if the user corrected your approach or confirmed a decision/constraint, capture it per AGENTS.md Memory.
