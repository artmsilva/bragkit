import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { makeId, type RawAchievement } from "../src/achievement.ts";

function sample(overrides: Partial<RawAchievement> = {}): RawAchievement {
  return {
    id: makeId("github", "pr_merged", "owner/repo:1"),
    source: "github",
    type: "pr_merged",
    title: "feat: a thing",
    url: "https://example.com/1",
    date: "2025-06-01T12:00:00Z",
    tags: ["pull-request", "owner/repo"],
    metadata: { repository: "owner/repo", number: 1 },
    ...overrides,
  };
}

test("upsert is idempotent on id (no duplicate rows)", () => {
  const store = new Store();
  store.upsert(sample());
  store.upsert(sample({ title: "feat: a renamed thing" }));
  const rows = store.query({});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "feat: a renamed thing");
  store.close();
});

test("query filters by source, type, and date range; newest first", () => {
  const store = new Store();
  store.upsert(sample({ id: "github:pr_merged:r:1", date: "2025-01-01T00:00:00Z" }));
  store.upsert(sample({ id: "github:pr_merged:r:2", date: "2025-06-01T00:00:00Z" }));
  store.upsert(sample({ id: "jira:issue:r:3", source: "jira", type: "issue", date: "2025-03-01T00:00:00Z" }));

  assert.equal(store.query({ source: "github" }).length, 2);
  assert.equal(store.query({ type: "issue" }).length, 1);

  const ranged = store.query({ since: "2025-02-01T00:00:00Z", until: "2025-07-01T00:00:00Z" });
  assert.deepEqual(ranged.map((a) => a.id), ["github:pr_merged:r:2", "jira:issue:r:3"]);
  store.close();
});

test("tags and metadata round-trip through JSON columns", () => {
  const store = new Store();
  store.upsert(sample());
  const [row] = store.query({});
  assert.deepEqual(row.tags, ["pull-request", "owner/repo"]);
  assert.equal(row.metadata.number, 1);
  store.close();
});

test("stats aggregates totals and breakdowns", () => {
  const store = new Store();
  store.upsert(sample({ id: "github:pr_merged:r:1" }));
  store.upsert(sample({ id: "jira:issue:r:2", source: "jira", type: "issue" }));
  const stats = store.stats({});
  assert.equal(stats.total, 2);
  assert.equal(stats.bySource.github, 1);
  assert.equal(stats.byType.issue, 1);
  store.close();
});

test("collection runs are recorded and queryable, newest first", () => {
  const store = new Store();
  store.recordRun({ source: "github", since: "2025-01-01T00:00:00Z", until: "2025-06-01T00:00:00Z", collected: 12, errors: [] });
  store.recordRun({ source: "jira", since: "2025-01-01T00:00:00Z", until: "2025-06-01T00:00:00Z", collected: 3, errors: ["boom"] });
  const rows = store.runs(10);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, "jira");
  assert.equal(rows[0].status, "partial");
  assert.deepEqual(rows[0].errors, ["boom"]);
  assert.equal(rows[1].status, "success");
  store.close();
});

test("lastSuccess returns the until of the latest successful run for a source", () => {
  const store = new Store();
  store.recordRun({ source: "github", since: "2025-01-01T00:00:00Z", until: "2025-03-01T00:00:00Z", collected: 1, errors: [] });
  store.recordRun({ source: "github", since: "2025-03-01T00:00:00Z", until: "2025-06-01T00:00:00Z", collected: 2, errors: [] });
  store.recordRun({ source: "github", since: "2025-06-01T00:00:00Z", until: "2025-09-01T00:00:00Z", collected: 0, errors: ["x"] });
  assert.equal(store.lastSuccess("github"), "2025-06-01T00:00:00Z");
  assert.equal(store.lastSuccess("slack"), null);
  store.close();
});

test("upsert rejects malformed achievements", () => {
  const store = new Store();
  assert.throws(() => store.upsert({ source: "x", type: "y", title: "z", date: "2025-01-01" } as RawAchievement), /missing required/);
  assert.throws(() => store.upsert(sample({ date: "not-a-date" })), /invalid date/);
  store.close();
});
