---
description: "Create a TDD implementation plan from a feature specification"
---

Invoke the Planner subagent to create a structured, TDD-sequenced implementation plan.

**Usage:**
- `/plan "inline feature spec text with Section 7 acceptance criteria"`
- `/plan path/to/feature-spec.md`

**Output:** Plan folder at `docs/project/plans/YYYY-MM-DD_HHMM_FEATURE_NAME/` with INDEX.md and task files, or inline task specification for trivial single-task features.

Delegate to the `planner` subagent with the provided feature specification.