---
description: "Design a logo from a brief using the logo-design skill"
agent: build
subtask: false
---

Design a logo (runs as the Build agent in-process; `subtask: false`).

**Usage:**
- `/logo "company name, industry, style hints"`

Load the `logo-design` skill via the skill tool first. If it is
unavailable or its use is declined, stop and say so — do not improvise
a logo workflow.

Follow the skill end to end:

- Ask discovery questions in ONE batch via the question tool (at most 5).
- Run helper scripts with the first working of `py -3` or `python` —
  never `python3`.
- Work in `design/logo/` (create it). If the project `.gitignore`
  lacks `design/logo/`, add it and say so.
- If you cannot view images, state that in your first reply and make
  no visual-verification claims afterwards.
- Treat the skill's library SVGs as study-only references — never
  trace or copy them into concepts.
- Checkpoint reply (at most 8 lines): concept image paths, one line
  per concept, your recommendation, and the kit offer. Build the full
  kit only after an explicit yes.
- On kit approval, ask once for a tracked destination and copy only
  the final kit files there.

$ARGUMENTS
