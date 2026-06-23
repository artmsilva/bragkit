import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByMonth, renderTrend } from "../src/reports/trends.ts";
import { salaryAnalysis } from "../src/reports/salary.ts";
import { computeMetrics } from "../src/reports/impact.ts";
import type { Achievement } from "../src/achievement.ts";
import type { Period } from "../src/dates.ts";
import type { Bands } from "../src/reports/salary.ts";

const PERIOD: Period = { since: "2025-01-01T00:00:00Z", until: "2025-12-31T23:59:59Z" };

const DATA: Achievement[] = [
  { id: "a", source: "github", type: "pr_merged", title: "Jan PR", date: "2025-01-15T00:00:00Z" },
  { id: "b", source: "github", type: "issue_closed", title: "Jan issue", date: "2025-01-20T00:00:00Z" },
  { id: "c", source: "github", type: "pr_merged", title: "Mar PR", date: "2025-03-02T00:00:00Z" },
  { id: "d", source: "jira", type: "issue_resolved", title: "Mar Jira", date: "2025-03-10T00:00:00Z" },
  { id: "e", source: "jira", type: "issue_resolved", title: "Another Mar Jira", date: "2025-03-31T23:30:00Z" },
] as Achievement[];

test("groupByMonth buckets by UTC month with per-type counts", () => {
  const months = groupByMonth(DATA);
  assert.equal(months.length, 2, "two distinct months");
  assert.deepEqual(months.map((m) => m.month), ["2025-01", "2025-03"], "sorted ascending");

  const jan = months[0];
  assert.equal(jan.count, 2);
  assert.deepEqual(jan.byType, { pr_merged: 1, issue_closed: 1 });

  const mar = months[1];
  assert.equal(mar.count, 3);
  assert.deepEqual(mar.byType, { pr_merged: 1, issue_resolved: 2 });
});

test("groupByMonth buckets by UTC, not local time, and skips bad dates", () => {
  // 2025-01-31T23:30:00Z is still January in UTC.
  const months = groupByMonth([
    { id: "x", type: "pr_merged", date: "2025-01-31T23:30:00Z" },
    { id: "bad", type: "pr_merged", date: "not-a-date" },
  ] as Achievement[]);
  assert.equal(months.length, 1);
  assert.equal(months[0].month, "2025-01");
  assert.equal(months[0].count, 1, "unparseable date dropped");
});

test("groupByMonth returns [] for no achievements", () => {
  assert.deepEqual(groupByMonth([]), []);
});

test("renderTrend includes the heading, a known month, and the table", () => {
  const md = renderTrend(DATA, PERIOD);
  assert.match(md, /^# Achievement Trends/, "H1 heading");
  assert.match(md, /\| Month \| Count \|/, "per-month table header");
  assert.match(md, /\| 2025-03 \| 3 \|/, "known month row");
  assert.match(md, /█/, "ASCII bar present");
});

test("renderTrend handles an empty period gracefully", () => {
  const md = renderTrend([], PERIOD);
  assert.match(md, /^# Achievement Trends/);
  assert.match(md, /No achievements/);
});

test("salaryAnalysis renders a band label and frames it as inputs", () => {
  const metrics = computeMetrics(DATA);
  const bands: Bands = {
    currency: "USD",
    note: "Sample",
    bands: [
      { level: "Senior", median: 180000 },
      { level: "Staff", median: 240000 },
      { level: "Principal", median: 320000 },
    ],
  };
  const md = salaryAnalysis(metrics, bands);
  assert.match(md, /^# Salary Conversation Prep/);
  assert.match(md, /inputs for a conversation/i);
  assert.match(md, /Staff/, "a band level appears");
  assert.match(md, /Nearest band/, "anchor section present");
});

test("salaryAnalysis does not anchor when medians are placeholder zeroes", () => {
  const md = salaryAnalysis(computeMetrics(DATA), {
    bands: [{ level: "Senior", median: 0 }],
  });
  assert.match(md, /placeholder medians/i, "no fabricated anchor on 0 medians");
});
