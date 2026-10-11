---
name: test-pipeline
description: Generic ordered-stage test pipeline guidance for any stack. Load when running tests or before merging, when no project-specific test-pipeline skill exists.
---

# Test Pipeline (generic fallback)

This is a fallback for projects that haven't defined their own
`test-pipeline` skill under `.opencode/skills/`. A project-level skill
with this same name always takes precedence — this one only applies when
nothing more specific is around, since a global skill can't hardcode any
one project's actual commands.

## Order

Run stages in this order and stop at the first failure — don't skip ahead
to the next stage:

1. Typecheck / build (if the language has one)
2. Lint / static analysis
3. Unit tests
4. Integration tests (if present)
5. E2E tests (if present)
6. Coverage (if a threshold is configured — see note below)

## Detecting the actual commands

Don't assume a package manager or runner. Check, in order:

- `package.json` `scripts` (npm/bun/pnpm/yarn — check the lockfile to
  know which one)
- `pyproject.toml` / `tox.ini` for Python
- `Cargo.toml` for Rust (`cargo check`, `cargo clippy`, `cargo test`)
- `go.mod` for Go (`go vet`, `go test ./...`)
- A `Makefile` or `justfile`, which often wraps all of the above into one
  target

If nothing is discoverable, ask rather than guessing at a command.

## Notes

- Assumes no running DB by default; a project's own skill should add DB
  setup steps if its pipeline needs one.
- Run from the repo root unless the project's own skill says otherwise
  (e.g. a subdirectory for monorepos).
- Coverage is a stage to run *if the project already configured a
  threshold* — this skill doesn't set one. Don't propose adding a
  coverage gate (and don't treat 100% as any kind of target) unless
  asked; that's a project decision, not a default.
