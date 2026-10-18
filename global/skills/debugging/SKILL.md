---
name: debugging
description: Root-cause debugging loop - reproduce, read the real error, isolate, test hypotheses one at a time, fix with a regression test. Load for bugs, failing tests, flaky behavior.
---

# Debugging

1. **Reproduce.** Exact command/input. Can't reproduce -> say so and ask; don't patch blind.
2. **Read the actual error** (full message, first stack frame in project code) before theorizing.
3. **Isolate.** Smallest repro; bisect by `git log`/`git bisect`, by input, or by disabling pieces. Change one variable at a time; revert failed experiments.
4. **Hypotheses.** List 2-3, ranked. Test the cheapest disconfirming check first. Evidence over intuition.
5. **Fix the cause, not the symptom.** If the fix is a guard/retry/sleep, justify why the cause can't be fixed.
6. **Regression test** that fails before the fix and passes after. No harness -> a runnable repro command.
7. **Sweep siblings:** grep for the same pattern elsewhere; report, don't silently widen scope.
8. **Stop rule:** 3 failed hypotheses -> summarize evidence so far and ask the user.
9. **Record:** non-obvious or costly bug -> `/log-error` (symptom, cause, fix) so it isn't rediscovered.
