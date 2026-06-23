import { test } from "node:test";
import assert from "node:assert/strict";
import { impactScore, computeMetrics, topByImpact } from "../src/reports/impact.ts";
import type { Achievement } from "../src/achievement.ts";

const pr = (md: Record<string, unknown> = {}): Achievement =>
  ({ type: "pr_merged", metadata: md }) as unknown as Achievement;

test("impactScore rewards code volume, reactions, and story points", () => {
  assert.ok(impactScore(pr({ additions: 500, commits: 4 })) > impactScore(pr({ additions: 10 })));
  assert.ok(impactScore({ type: "kudos_received", metadata: { reactionCount: 5 } } as unknown as Achievement) >= 20 + 25);
});

test("impactScore caps code-volume contribution so one huge PR can't dominate", () => {
  const huge = impactScore(pr({ additions: 1_000_000 }));
  const big = impactScore(pr({ additions: 5000 }));
  assert.equal(huge - big, 0, "additions contribution is capped at 50");
});

test("computeMetrics sums across types and metadata", () => {
  const data: Achievement[] = [
    { type: "pr_merged", metadata: { additions: 100, deletions: 20, changedFiles: 3, commits: 2 } },
    { type: "issue_resolved", metadata: { storyPoints: 5 } },
    { type: "kudos_received", metadata: { reactionCount: 4 } },
    { type: "blog_created", metadata: {} },
  ] as unknown as Achievement[];
  const m = computeMetrics(data);
  assert.equal(m.total, 4);
  assert.equal(m.prsMerged, 1);
  assert.equal(m.issuesResolved, 1);
  assert.equal(m.pagesCreated, 1);
  assert.equal(m.kudos, 1);
  assert.equal(m.storyPoints, 5);
  assert.equal(m.additions, 100);
  assert.equal(m.commits, 2);
  assert.equal(m.reactions, 4);
});

test("topByImpact ranks highest-impact first", () => {
  const data = [pr({ additions: 10 }), pr({ additions: 800, commits: 5 }), pr({ additions: 50 })];
  const top = topByImpact(data, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].metadata.additions, 800);
});
