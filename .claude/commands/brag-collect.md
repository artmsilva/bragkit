---
description: Collect achievements into the local bragkit database
argument-hint: [--source github,jira] [--since "30 days ago"] [--until today] [--enrich]
allowed-tools: Bash(node bin/brag.js:*)
---

Collect professional achievements using the bragkit CLI, then report the result.

1. Run: `node bin/brag.js collect $ARGUMENTS --json`
   (If the user gave no arguments, collect the last 30 days from every configured collector.)
2. Parse the JSON summary (`collected`, `bySource`, `errors`).
3. If any error mentions missing credentials, tell the user the exact fix:
   - github → `gh auth login`
   - jira/confluence → set `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, and a token (`ATLASSIAN_API_TOKEN` or `BRAGKIT_OP_TOKEN_REF`)
   - slack → set `SLACK_USER_TOKEN`
   Then stop and let them fix it.
4. Summarize: total collected, per-source counts, and any non-credential errors.
   Suggest `/brag-report` or `/brag-compensation` as the next step.
