---
description: Run the project's test pipeline
agent: tester
subtask: true
---

Run the test pipeline. $ARGUMENTS

After the tester subtask completes, check its output for test failures:

- If the tester reported **no failures**: do nothing extra.

- If the tester reported **failures**: extract the first 3 failure summaries
  (test name + brief reason, one line each). Append each as a single line to
  `.opencode/.pending-test-errors` in the current project directory, format:
  `YYYY-MM-DD — Test failure: <name> — <brief reason>`
  (Create the file if it doesn't exist; append if it does.)

  Then inform the user:
  ```
  N failure(s) captured. Run /end-session to review and optionally log them as errors.
  ```
