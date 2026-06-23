---
description: Export achievements and open the browsable dashboard
argument-hint: [--db <path>]
allowed-tools: Bash(node bin/brag.ts:*), Bash(npm run:*)
---

Refresh the dashboard data and open it.

1. Run: `node bin/brag.ts export $ARGUMENTS`
   (writes `web/public/achievements.json`, which the dashboard reads).
2. Start the dashboard: `npm run web:dev` and share the printed local URL
   (the dev server has hot-reload). For a static build instead, use `npm run web:build`.
3. If export reported 0 achievements, suggest running `/brag-collect` first.

The dashboard shows stat cards, an activity-by-month sparkline, impact-ranked
top achievements, an in-page report viewer (any template), and a
searchable/filterable list.
