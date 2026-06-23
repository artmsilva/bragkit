import type { Achievement } from "../achievement.ts";

/**
 * Impact scoring and metric aggregation — the quantified backbone of the
 * dashboard's "top achievements" ranking and the compensation report. Pure
 * functions over the Achievement model so they're trivially testable.
 */

export interface Metrics {
  total: number;
  prsMerged: number;
  issuesClosed: number;
  issuesResolved: number;
  pagesCreated: number;
  kudos: number;
  storyPoints: number;
  additions: number;
  deletions: number;
  filesChanged: number;
  commits: number;
  reactions: number;
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/**
 * Heuristic impact score for ranking achievements. Weights mirror the original
 * brag-book dashboard: code volume, peer reactions, recognition, and planning
 * signal (story points) all count, with code volume capped so one giant PR
 * can't dominate.
 */
export function impactScore(a: Achievement): number {
  const md = a.metadata || {};
  let score = 1; // base: it happened
  score += Math.min(50, num(md.additions) / 100);
  score += num(md.commits);
  score += num(md.reactionCount) * 5;
  score += num(md.storyPoints) * 2;
  if (a.type === "kudos_received") score += 20;
  if (a.type === "blog_created") score += 15;
  if (a.type === "pr_merged") score += 3;
  return Math.round(score);
}

/** Sum the quantified-impact metrics across a list of achievements. */
export function computeMetrics(achievements: readonly Achievement[]): Metrics {
  const m: Metrics = {
    total: achievements.length,
    prsMerged: 0, issuesClosed: 0, issuesResolved: 0, pagesCreated: 0, kudos: 0,
    storyPoints: 0, additions: 0, deletions: 0, filesChanged: 0, commits: 0, reactions: 0,
  };
  for (const a of achievements) {
    const md = a.metadata || {};
    if (a.type === "pr_merged") m.prsMerged++;
    if (a.type === "issue_closed") m.issuesClosed++;
    if (a.type === "issue_resolved") m.issuesResolved++;
    if (a.type === "page_created" || a.type === "blog_created") m.pagesCreated++;
    if (a.type === "kudos_received") m.kudos++;
    m.storyPoints += num(md.storyPoints);
    m.additions += num(md.additions);
    m.deletions += num(md.deletions);
    m.filesChanged += num(md.changedFiles);
    m.commits += num(md.commits);
    m.reactions += num(md.reactionCount);
  }
  return m;
}

/** Return the top-N achievements by impact score (descending). */
export function topByImpact(achievements: readonly Achievement[], n = 10): Achievement[] {
  return [...achievements].sort((a, b) => impactScore(b) - impactScore(a)).slice(0, n);
}
