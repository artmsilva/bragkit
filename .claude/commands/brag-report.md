---
description: Generate a bragkit achievement report for a period
argument-hint: <period> [--template timeline|by-project|executive-summary|brag-sheet|compensation]
allowed-tools: Bash(node bin/brag.ts:*)
---

Generate a markdown report from already-collected achievements.

1. Treat `$ARGUMENTS` as the period plus optional flags. Default the period to
   the current year and the template to `executive-summary` if unspecified.
2. Run: `node bin/brag.ts report $ARGUMENTS`
3. Show the rendered markdown to the user.
4. If the report is empty, suggest running `/brag-collect` first for that period.
