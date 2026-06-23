---
name: create-collector
description: Add a new data-source collector to bragkit. Use when the user wants to pull achievements from a new source (GitLab, Linear, a REST API, local git log, calendar, RSS, anything) into bragkit, says "add a collector", "support <service>", "track my <X>", or "write a bragkit collector". Walks through the one-function contract, a copy-paste TypeScript template, registration, and tests.
---

# Create a bragkit collector

A collector is **one async function** that turns a time range into achievements.
Storage, reports, dashboard, and the compensation math are all source-agnostic —
they only read the `Achievement` model — so a new collector is genuinely small.

bragkit is **TypeScript run natively by Node** (type-stripping, no build). Honor
the rules in `AGENTS.md`: **zero runtime dependencies** (use `fetch`, a CLI the
user already has like `gh`, or local files — never an npm SDK), `.ts` import
extensions, `import type` for types, erasable syntax only, `strict` on.

## The contract

```ts
import type { Collector, CollectResult } from "./registry.ts";

export const mysource: Collector = {
  name: "mysource",                                  // unique; used for --source and tags
  async collect({ since, until }): Promise<CollectResult> {
    // ...fetch + map...
    return { achievements, errors };                 // errors: string[] (non-fatal; never throw)
  },
};
```

## Steps

1. **Create `src/collectors/<name>.ts`** from the template below.
2. **Map** each source item to an `Achievement`. Use `makeId(source, type, externalId)`
   for the id — that's what makes re-collection idempotent.
3. **Register** it: add to the `[github, …].forEach(register)` array in `src/cli.ts`;
   export it from `src/index.ts`.
4. **Test the pure mapping** in `test/<name>.test.ts` with `node:test` — no network.
5. Verify: `npm test`, `npm run typecheck`, then
   `node bin/brag.ts collect --source <name> --since "30 days ago"`.

## The Achievement shape

`id` (required, via `makeId`), `source`, `type`, `title`, `date` (ISO) are
required; `description`, `url`, `tags`, `metadata` are optional. Put **numbers**
in `metadata` (`additions`, `storyPoints`, `reactionCount`, `commits`,
`changedFiles`) — `src/reports/impact.ts` reads them for scoring and the
compensation report, so a metric in metadata "just works."

## Template

```ts
// src/collectors/mysource.ts
import { makeId, type Achievement } from "../achievement.ts";
import type { Collector, CollectResult } from "./registry.ts";

export const mysource: Collector = {
  name: "mysource",

  async collect({ since, until }): Promise<CollectResult> {
    const errors: string[] = [];

    // 1) Auth without adding deps: env token (document it in AGENTS.md + `config`),
    //    or shell out to a CLI the user already has.
    const token = process.env.MYSOURCE_TOKEN;
    if (!token) return { achievements: [], errors: ["mysource: set MYSOURCE_TOKEN."] };

    // 2) Fetch (built-in fetch — no axios). Handle pagination + non-200.
    let raw: any[];
    try {
      const res = await fetch(`https://api.example.com/me/items?from=${day(since)}&to=${day(until)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { achievements: [], errors: [`mysource ${res.status}`] };
      raw = (await res.json() as { items?: any[] }).items ?? [];
    } catch (e) {
      return { achievements: [], errors: [`mysource fetch failed: ${e instanceof Error ? e.message : String(e)}`] };
    }

    // 3) Map via a PURE function (unit-test this part).
    return { achievements: raw.map(toAchievement), errors };
  },
};

/** Pure: source item -> Achievement. Test this with fixtures. */
export function toAchievement(item: any): Achievement {
  return {
    id: makeId("mysource", "item_done", item.id),
    source: "mysource",
    type: "item_done",
    title: item.name,
    description: "",
    url: item.web_url,
    date: item.completed_at,
    tags: ["mysource", item.project],
    metadata: { project: item.project, points: item.points },
  };
}

function day(iso: string): string { return new Date(iso).toISOString().slice(0, 10); }
```

```ts
// test/mysource.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toAchievement } from "../src/collectors/mysource.ts";

test("maps a source item to a well-formed achievement", () => {
  const a = toAchievement({ id: "42", name: "Did a thing", web_url: "https://x/42",
    completed_at: "2025-06-01T00:00:00Z", project: "alpha", points: 3 });
  assert.equal(a.id, "mysource:item_done:42");
  assert.equal(a.source, "mysource");
  assert.equal(a.metadata.points, 3);
});
```

## Patterns worth copying

- **Auth via existing CLI** (no token): `src/collectors/github.ts` (`gh`).
  **Auth via env + 1Password**: `src/atlassian.ts` (`resolveAuth`, env → `op read`;
  narrow its result with `if ("error" in auth)`). **Bearer token**: `src/collectors/slack.ts`.
- **Pagination**: `searchAll` in `jira.ts` (token paging), `confluence.ts` (start/limit).
- **Scope filters**: accept extra `CollectOptions` (`repos`, `projects`, …) and
  thread them from `cli.ts`.
- **`config` readiness**: add a row to the `checks` array in `cli.ts`'s
  `configReady()` so `brag config` reports your collector.

## Checklist

- [ ] `collect()` returns `{ achievements, errors }`; never throws for expected failures.
- [ ] Stable `makeId(...)` so re-collection is idempotent.
- [ ] Registered in `cli.ts`, exported from `index.ts`.
- [ ] Pure mapping unit-tested; `npm test` + `npm run typecheck` green.
- [ ] Required env/auth documented in `AGENTS.md` and surfaced in `config`.
