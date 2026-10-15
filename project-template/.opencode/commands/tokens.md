---
description: Show recent token usage with per-response breakdown
---
Run `node tools/token-report/summary.js` (groups the last ~300 TokenUsage.md lines into ≤50 per-prompt rows) and render its output.
(If that fails, reply "No usage data yet." — never block the session.)
Per-response totals are a naive SDK-field sum for trend tracking; for authoritative cost/breakdown cross-check `opencode stats --days 7`.
Never read TokenUsage.md/TokenUsage_archive.md directly — use this summary (budget: outline+lines only, archive is 2000+ lines).
