---
name: review-checklist
description: What to check during a code review — architecture, readability, correctness, maintainability. Load when reviewing changes or when the reviewer agent runs.
---

# Review Checklist

Check changes against these categories. Report findings as CRITICAL /
HIGH / MEDIUM / LOW.

- **Correctness** — does it do what it claims? Are edge cases handled?
- **Architecture** — does it fit the existing patterns, or does it
  introduce a divergent approach without reason? Is each new component
  justified by a stated requirement or failure mode, not "just in case"?
- **Readability** — would someone unfamiliar with this change understand
  it in six months?
- **Scope** — does the change touch only what it needs to, or does it
  drift into unrelated files?
- **Error handling** — are failures handled explicitly, or do they fail
  silently?
- **Duplication** — does this repeat logic that already exists elsewhere
  in the codebase?
- **Tests** — is new behavior covered, and would the test fail without the
  change? Are edge cases and error paths tested, not just the happy path?
- **Data & contracts** — migrations reversible and additive? Queries use
  indexes? API/type changes backward compatible, with callers updated?
- **Security touchpoints** — auth, input handling, secrets, payments:
  flag and recommend `/security` rather than judging in-line.
- **Project constraints** — does it violate anything in
  `.opencode/memory/` (decisions, constraints)?

A project can define its own `review-checklist` skill under
`.opencode/skills/` to add project-specific conventions (naming, folder
structure, required file layout). That version takes precedence over
this global default.
