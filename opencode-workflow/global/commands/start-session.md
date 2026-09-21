---
description: Mark session start for /end-session scoping
---

Record the start of this session so `/end-session` can scope its git log and
candidate generation accurately.

1. Get the current ISO timestamp: `(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')`

2. Get the current git HEAD SHA:
   Run `git rev-parse HEAD`. If it fails (no commits yet), use the string
   `no-commits`.

3. Write `.opencode/.session-start` with exactly two lines:
   ```
   <ISO timestamp>
   <HEAD SHA or no-commits>
   ```
   Overwrite if the file already exists.

4. Confirm to the user:
   ```
   Session start recorded at <timestamp> (HEAD: <sha-or-no-commits>).
   Run /end-session at the end of the session to review and log decisions/errors.
   ```

$ARGUMENTS
