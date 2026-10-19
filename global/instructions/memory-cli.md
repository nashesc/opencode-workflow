# memory.js CLI reference

On-demand detail for the Memory rules in `AGENTS.md`. Read this only when you
need the exact flags, the dedupe flow, or the scope rules. It is deliberately
NOT auto-loaded: it costs a prompt every session and is needed rarely.

```
node ~/.config/opencode/scripts/memory.js add <pref|constraint|decision|error> "<text>" [--why ..] [--scope user|project] [--project name] [--supersede <id>] [--force]
node ~/.config/opencode/scripts/memory.js recall "<query>" [--project name] [--limit 6] [--archive]
node ~/.config/opencode/scripts/memory.js brief  [--project name]
node ~/.config/opencode/scripts/memory.js init   [project]
node ~/.config/opencode/scripts/memory.js sync
node ~/.config/opencode/scripts/memory.js lint
```

Exit codes: `0` ok / skipped-duplicate, `1` error, `2` similar entry needs a
decision, `3` rejected (secret or too long).

## Entry types

| Type | Means | Default scope |
| --- | --- | --- |
| `pref` | how the user wants you to behave | user |
| `constraint` | a rule or recurring requirement | project |
| `decision` | a choice plus why | project |
| `error` | a failure plus its cause | project |

`pref` and `constraint` go to `context.md`; `decision` and `error` go to the
vault `Decisions.md` / `Errors.md` and are mirrored into the project's
`.opencode/memory/` files by the `/log-decision` and `/log-error` commands.

## Dedupe flow

`DUP` means the entry is already stored — that is fine, stop.
`SIMILAR <id>` means it overlaps an older entry:

- the new entry replaces the old one → rerun with `--supersede <id>`
- both stay valid → rerun with `--force`
- unsure → ask the user

Never leave contradictory entries in the log.

## Scope rules

- `pref` → user scope (cross-project) unless `--scope project`.
- `constraint` → project scope unless `--scope user`.
- `decision` / `error` → always the vault, tagged with the project.

## Files

| Path | Role |
| --- | --- |
| `~/.config/opencode/memory/profile.md` | generated user prefs, auto-loaded |
| `<project>/.opencode/memory/context.md` | project prefs/constraints, auto-loaded |
| `<project>/.opencode/memory/{decisions,errors}.md` | live window (25 entries), auto-loaded |
| `<project>/.opencode/memory/*_archive.md` | the rest of the same log, never auto-loaded |
| `<vault>/OpenCode/Decisions.md`, `Errors.md`, `Context.md` | durable store |

`recall` searches the vault, the project files **and** their `*_archive.md`
siblings, so archiving never makes an entry unreachable.

`lint` reports orphans, basename collisions, duplicates and unmanaged lines.
Run it after changing the log files.
