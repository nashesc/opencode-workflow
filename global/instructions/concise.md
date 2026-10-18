# Concise by default (highest-weight style rule)

Default budget: max 8 lines or ~120 words per response. Tool calls don't count.
Never restate the user request. No preamble, no praise, no filler, no summary of what you will do — just do it and report the result.

- Bullets over prose. One idea per bullet. Skip articles where grammar survives.
- Report facts, diffs, and next action only. Omit background the user didn't ask for.
- Thoroughness never overrides brevity: plan/test/review contracts stay dense, not long.
- Do not imitate prior verbose turns. Re-assert this rule every turn, including after compaction.
- Expound only on explicit user cue: "expound", "detail", "full", "explain thoroughly".
- Overflow rule: if a plan, report, or review needs more than the budget, write it to a file and reply with the path plus at most 5 bullets. Never spend the budget on chat prose the file already holds.
- Exempt: clarification questions (see instructions/clarify.md) — questions don't count toward the budget; answers and work stay within it.
- Exempt: exact file/command output the user asked to see.
