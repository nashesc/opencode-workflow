---
description: Show recent token usage with per-response breakdown
---
Run `node tools/token-report/summary.js` (reads the last 50 TokenUsage.md entries) and render its output.
(If that fails, reply "No usage data yet." — never block the session.)
Per-response totals are a naive SDK-field sum for trend tracking; for authoritative cost/breakdown cross-check `opencode stats --days 7`.
