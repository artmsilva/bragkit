# bragkit backlog

Prioritized feature backlog. Sourced from a port-gap analysis of the original
brag-book plus new ideas. Keep entries short; move details into code/PRs.

## Done

- [x] **Written in TypeScript, run natively by Node** (type-stripping; no build step)
- [x] Core engine: `node:sqlite` store, Achievement model, idempotent upsert
- [x] Collectors: GitHub (PRs + closed issues + `--enrich` GraphQL), Jira, Confluence, Slack
- [x] Scope filters: `--source`, `--github-repos`, `--jira-projects`, `--confluence-spaces`, `--slack-channels`
- [x] Reports: timeline, by-project, executive-summary, brag-sheet, compensation, trend; `--format json|csv|pdf`
- [x] Impact scoring + metrics aggregation (`reports/impact.ts`)
- [x] Salary-band analysis for compensation report (`--bands`, opt-in JSON)
- [x] CLI: collect / report / export / list / config / runs
- [x] `config` subcommands (show / init / set / path) + persistent `~/.config/bragkit/config.json`
- [x] Incremental collection — default `--since` to each source's last successful run
- [x] `--verbose` flag
- [x] Bootstrap + vite-plus dashboard (cards, search, filters, theme, impact + kudos sections)
- [x] Collection-run audit table + `brag runs`
- [x] Agent tooling: `.claude/` commands, `bragkit` + `create-collector` skills, curator agent
- [x] CI (`npm test` on Node 24+26, `tsc --noEmit` strict typecheck, smoke)
- [x] Jira created-issues (`--include-created`) + Confluence updated-pages (`--include-updated`), opt-in
- [x] Slack thread replies + `chat.getPermalink` canonical URLs
- [x] Named Slack reaction thresholds (engagement 3+, kudos 1+)
- [x] Dashboard "Activity by month" sparkline (from `reports/trends.ts`)
- [x] Auto-tagging + cross-source dedup hints (`tagging.ts`: ticket-key extraction → tags + `relatedKeys`)
- [x] Published-bin smoke test (`scripts/pack-smoke.ts`) + CI `publish-check` job
- [x] Publish model decided: dev runs `.ts` natively; publish compiles to `dist/` (`tsconfig.build.json`, `prepack`/`prepare`) because Node won't type-strip under `node_modules`
- [x] README dashboard screenshot (rendered from bundled sample data)

## Low value / nice-to-have

- [ ] More collectors: GitLab, Linear, local `git log`, calendar/meetings
      (use the `create-collector` skill).
- [ ] Group/merge achievements sharing a `relatedKeys` ticket in reports/dashboard.

## Done — quality / infra

- [x] CI: test (Node 24+26), typecheck (`tsc --noEmit`), publish-check
- [x] `npx`-equivalent published-bin verification in a clean temp project
