---
description: Generate a quantified compensation / promo briefing from achievements
argument-hint: <period>  (e.g. "2025" or "2025-01-01 to 2025-12-31")
allowed-tools: Bash(node bin/brag.js:*)
---

Produce a compensation briefing: metrics table, impact-ranked highlights, and
talking points.

1. Use `$ARGUMENTS` as the period (default to the trailing 12 months if none).
2. Run: `node bin/brag.js report "$ARGUMENTS" --template compensation`
3. Present the briefing. If the metrics table is missing code-volume numbers
   (lines/files/commits), tell the user to re-collect GitHub with `--enrich`,
   and that Jira (story points) and Slack (kudos) enrich it further.
4. Keep the framing honest — only cite numbers the report actually produced.
