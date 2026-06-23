---
description: Quarterly executive-summary report (preset)
argument-hint: [Q1 2025 | current | last]   (defaults to the current quarter)
allowed-tools: Bash(node bin/brag.ts:*)
---

A shortcut for a quarterly executive summary — handy for reviews, quarterly
check-ins, and promo packets.

1. Resolve the quarter from `$ARGUMENTS`:
   - `Q<n> <year>` → use as-is.
   - `current` or empty → compute the quarter containing today.
   - `last` → the previous quarter (roll the year back if needed).
2. Run: `node bin/brag.ts report "<Qn YYYY>" --template executive-summary`
   (bragkit's period parser understands the `Qn YYYY` form directly.)
3. Show the rendered summary. If it's empty, suggest `/brag-collect` for that quarter.
