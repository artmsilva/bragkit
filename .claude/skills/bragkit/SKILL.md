---
name: bragkit
description: Track and report professional achievements with the bragkit CLI. Use when the user wants to collect their work (merged GitHub PRs, resolved Jira issues, Confluence pages, Slack kudos) into a local database, generate achievement or compensation reports, prepare for a performance review / promo packet / résumé, or browse achievements in the dashboard. Triggers on "track my achievements", "what did I ship", "brag book", "prep for my review", "compensation case", "collect my PRs".
---

# bragkit

bragkit is a zero-dependency engine that collects professional achievements into
a local SQLite database and turns them into markdown reports and a dashboard.

## When to use

- The user wants a record of what they shipped over a period.
- They're preparing for a performance review, promotion, or compensation talk.
- They want to feed real accomplishments into a résumé or brag sheet.

## Workflow

1. **Check setup:** `node bin/brag.js config` — shows which collectors are ready
   and how to configure the rest. Don't guess at credentials; point the user to
   the exact env var / auth step.
2. **Collect:** `node bin/brag.js collect --since "<date>" [--source ...] [--enrich]`.
   `--enrich` adds GitHub code-volume metrics (one API call per PR). Use scope
   flags (`--github-repos`, `--jira-projects`, …) to narrow.
3. **Report:** `node bin/brag.js report "<period>" --template <name>`.
   Templates: `timeline`, `by-project`, `executive-summary`, `brag-sheet`,
   `compensation`. Add `--format json` to pipe elsewhere.
4. **Browse / audit:** `node bin/brag.js list`, `node bin/brag.js runs`, or
   `node bin/brag.js export` + `npm run web:dev` for the dashboard.

## Principles

- The database lives at `~/.local/share/bragkit/bragkit.db` (override with `--db`).
- Collection is idempotent — re-running a period updates rows, never duplicates.
- Be honest with numbers: only cite metrics the reports actually produced.
- To extend it (new collector / template), read `AGENTS.md` — the contract is
  one async function returning `{ achievements, errors }`.
