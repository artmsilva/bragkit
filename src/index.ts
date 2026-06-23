/**
 * bragkit — the open-source core for tracking professional achievements.
 *
 * Public API surface. Import the pieces you need:
 *
 *   import { Store } from "bragkit/store";
 *   import { register, github } from "bragkit";
 *   import { renderReport } from "bragkit/reports";
 */
export { Store } from "./store.ts";
export type { QueryOptions, Stats, CollectionRun } from "./store.ts";
export { normalize, makeId } from "./achievement.ts";
export type { Achievement, RawAchievement } from "./achievement.ts";
export { register, get, names } from "./collectors/registry.ts";
export type { Collector, CollectOptions, CollectResult } from "./collectors/registry.ts";
export { github } from "./collectors/github.ts";
export { jira } from "./collectors/jira.ts";
export { confluence } from "./collectors/confluence.ts";
export { slack } from "./collectors/slack.ts";
export { resolveAuth, adfToText, htmlToText } from "./atlassian.ts";
export type { AtlassianAuth } from "./atlassian.ts";
export { render as renderReport, templates } from "./reports/markdown.ts";
export { impactScore, computeMetrics, topByImpact } from "./reports/impact.ts";
export type { Metrics } from "./reports/impact.ts";
export { parsePeriod, parseDate, formatDate } from "./dates.ts";
export type { Period } from "./dates.ts";
