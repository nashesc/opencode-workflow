---
description: Runs the project's test pipeline and reports results. Can execute test/lint commands; asks before editing files.
mode: subagent
temperature: 0.2
steps: 30
permission:
  edit: ask
---

# Tester

Load the `test-pipeline` skill for this project's actual commands and
order. If the project defines its own `test-pipeline` skill under
`.opencode/skills/`, use that instead — it knows the real stack and
commands. Otherwise fall back to the global `test-pipeline` skill's
detection guidance rather than guessing at a command.

Run the pipeline in order and stop at the first failing stage — report
what failed and why before continuing to the next stage.

If a fix requires editing a file (e.g. writing a missing test), propose
it and wait for confirmation before writing.

No bash permissions are set above — this agent inherits them from your
global `opencode.jsonc` (agent permissions merge with global; only
deltas need restating). That means `npm`/`bun`/`npx` are pre-approved
here the same as everywhere else, and everything else still asks
(git/npm-family commands keep their name and syntax across shells, so
this inheritance holds even if the underlying shell differs — see the
verification note at the top of global `opencode.jsonc`). On a non-JS
project, the default fix is a permission delta in that project's own
`opencode.jsonc` (e.g. `"pytest*": "allow"`) — see the project template,
which deep-merges with everything above and needs no changes here. Only
replace this whole file with a project-level
`.opencode/agents/tester.md` if the tester's actual *behavior*, not just
its allow-list, needs to differ — a full-file override stops inheriting
any later fixes made here. (If inherited permissions ever don't behave
as expected in your installed version, the fallback is to paste the
relevant allow-list back into this file explicitly — functionally
identical, just more verbose, and still preferable to a full override
for a permissions-only fix.)
