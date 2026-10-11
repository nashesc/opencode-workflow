---
description: "Create a TDD implementation plan from a feature specification"
agent: planner
subtask: false
---

Invoke the Planner subagent to create a structured, TDD-sequenced implementation plan.

**Usage:**
- `/plan "inline feature spec text with acceptance criteria"`
- `/plan path/to/feature-spec.md`

**Output:** Plan folder at `docs/project/plans/YYYY-MM-DD_HHMM_FEATURE_NAME/` with INDEX.md and task files, or inline task specification for trivial single-task features.

Create a structured, TDD-sequenced implementation plan from the provided feature specification (runs as the Planner, at depth 0, so subagent delegation works regardless of `subagent_depth`):

$ARGUMENTS