# AGENTS.md — working in bragkit

Guidance for AI agents (and humans) contributing to **bragkit**, the
zero-runtime-dependency achievement-tracking engine. Read this before editing.

## TypeScript, run natively — no build step

bragkit is written in **TypeScript** and run **directly by Node 24+** via
type-stripping. There is **no build, no bundler, no `dist/`** — `node bin/brag.ts`
just works. This keeps the project source-only while giving real types.

What that requires of you:

- **Import with the `.ts` extension**, always: `import { makeId } from "../achievement.ts"`.
- **Type-only imports use the `type` modifier** (`verbatimModuleSyntax`): `import type { Achievement } from "../achievement.ts"`, or inline `import { computeMetrics, type Metrics } from "./impact.ts"`.
- **Erasable syntax only** (`erasableSyntaxOnly`): no `enum`, `namespace`, parameter properties, or emitting decorators. Interfaces, `type`, generics, `as`, `satisfies`, and annotations are all fine.
- **`strict` is on.** Annotate exported function params/returns; guard `undefined`; reserve `any` for genuinely untyped boundaries (`await res.json()`, raw SQLite rows) and isolate it there.

## The one rule: zero RUNTIME dependencies

The shipping code (`src/`, `bin/`) imports **only the Node platform** — never an npm runtime package:

| Need | Use | Never add |
|------|-----|-----------|
| SQLite | `node:sqlite` (`DatabaseSync`) | `better-sqlite3`, `sql.js` |
| CLI args | `node:util` `parseArgs` | `commander`, `yargs` |
| Tests | `node:test` + `node:assert/strict` | `jest`, `vitest` |
| HTTP | global `fetch` | `axios`, `node-fetch` |
| Auth to a service | a CLI the user already has (`gh`), or env/`op` | bundled SDKs |

**Dev** dependencies are fine and intentional: `typescript` + `@types/node`
(type-checking), and `vite-plus` (the dashboard dev/build). The dashboard's CSS
(Bootstrap) loads from a CDN, not npm. If you think you need a runtime
dependency, stop — it's almost always avoidable on modern Node.

## Layout

```
bin/brag.ts              CLI entry (shebang → src/cli.ts)
src/
  achievement.ts         the Achievement model: interface + normalize()/makeId()
  store.ts               node:sqlite storage: upsert, query, stats, metrics, runs
  dates.ts               parseDate / parsePeriod / formatDate (+ Period)
  config.ts              persistent ~/.config/bragkit/config.json (+ Config)
  cli.ts                 parseArgs command dispatch
  atlassian.ts           shared Jira/Confluence auth + fetch + ADF/HTML (+ AtlassianAuth)
  collectors/
    registry.ts          the Collector contract (Collector/CollectOptions/CollectResult) + register/get/names
    github.ts  jira.ts  confluence.ts  slack.ts
  reports/
    markdown.ts          report templates (render/templates)
    impact.ts            impactScore / computeMetrics / topByImpact (+ Metrics)
    trends.ts  salary.ts  csv.ts  pdf.ts
web/                     Bootstrap + vanilla-TS/JS dashboard, built by vite-plus
test/                    *.test.ts — node:test
scripts/smoke.ts         end-to-end smoke check
```

## How to add a collector (the most common task)

A collector is **one async function** satisfying the `Collector` interface.
Normalize your source into the `Achievement` shape and you're done — storage and
reports are source-agnostic. There is a dedicated skill for this:
`.claude/skills/create-collector/`. The essentials:

```ts
import { makeId, type Achievement } from "../achievement.ts";
import type { Collector, CollectResult } from "./registry.ts";

export const mysource: Collector = {
  name: "mysource",
  async collect({ since, until }): Promise<CollectResult> {
    // ...fetch, then map to Achievement[]
    return { achievements, errors: [] }; // errors: string[], non-fatal
  },
};
```

1. Create `src/collectors/<name>.ts`.
2. Register it in `src/cli.ts` (`[github, …, mysource].forEach(register)`) and export from `src/index.ts`.
3. Unit-test the **pure** mapping/parse function in `test/<name>.test.ts` — don't hit the network.

Required Achievement fields: `id` (use `makeId(source, type, externalId)` — the
idempotency key), `source`, `type`, `title`, `date`. Put quantifiable signal
(`additions`, `storyPoints`, `reactionCount`, …) in `metadata` — `reports/impact.ts`
reads it for scoring and the compensation report.

## Conventions

- ESM only (`"type": "module"`). Private class fields use `#name`.
- Collectors return `{ achievements, errors }` and never throw for *expected*
  failures (missing auth, API errors) — push a friendly string into `errors`.
- Report templates take `(achievements: Achievement[], period: Period)` and read
  only the Achievement model — never a data source.
- In `web/`, never interpolate untrusted data into HTML without `escapeHtml`, and
  run URLs through `safeUrl` (scheme allowlist). Baseline web features only.

## Run it

```bash
npm test                 # node --test (runs *.test.ts) — must pass before commit
npm run typecheck        # tsc --noEmit (strict) — must be clean
npm run smoke            # end-to-end CLI smoke check
node bin/brag.ts help    # CLI usage
node bin/brag.ts config  # which collectors are configured
npm run web:dev          # dashboard
```

## Gotchas

- **Node 24+** required (type-stripping + stable `node:sqlite`).
- GitHub collector needs `gh auth login`; `--enrich` costs one GraphQL call per PR.
- Jira/Confluence need `ATLASSIAN_SITE` + `ATLASSIAN_EMAIL` + a token
  (`ATLASSIAN_API_TOKEN`, or `BRAGKIT_OP_TOKEN_REF` → a 1Password item).
- Slack needs `SLACK_USER_TOKEN` (preferred) or `SLACK_BOT_TOKEN`.
- Never commit a real `web/public/achievements.json` (git-ignored; may contain
  private data). Only `achievements.sample.json` is committed.

See **BACKLOG.md** for the prioritized list of unbuilt features.
