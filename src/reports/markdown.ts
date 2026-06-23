import { formatDate } from "../dates.ts";
import { computeMetrics, topByImpact } from "./impact.ts";
import { renderTrend } from "./trends.ts";
import type { Achievement } from "../achievement.ts";
import type { Period } from "../dates.ts";

/**
 * Report generators. Each takes a list of achievements (already filtered to a
 * period) plus the period metadata, and returns a markdown string. They read
 * only the Achievement model, so they work identically regardless of which
 * collectors produced the data.
 */

type TemplateFn = (achievements: Achievement[], period: Period) => string;

const TEMPLATES: Record<string, TemplateFn> = {
  timeline,
  "by-project": byProject,
  "executive-summary": executiveSummary,
  "brag-sheet": bragSheet,
  compensation: compensation,
  trend: renderTrend,
};

/** Render a named template (validated at runtime). */
export function render(template: string, achievements: Achievement[], period: Period): string {
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`Unknown template "${template}". Available: ${Object.keys(TEMPLATES).join(", ")}`);
  return fn(achievements, period);
}

export function templates(): string[] {
  return Object.keys(TEMPLATES);
}

/** Reverse-chronological list grouped by date. */
function timeline(achievements: Achievement[], period: Period): string {
  const lines = [head("Achievement Timeline", period, achievements.length), ""];
  let lastDay = "";
  for (const a of achievements) {
    const day = formatDate(a.date);
    if (day !== lastDay) {
      lines.push(`\n## ${day}\n`);
      lastDay = day;
    }
    const link = a.url ? `[${a.title}](${a.url})` : a.title;
    lines.push(`- **${a.type}** — ${link}`);
  }
  return lines.join("\n") + "\n";
}

/** Group achievements by their primary project tag / repository. */
function byProject(achievements: Achievement[], period: Period): string {
  const groups = new Map<string, Achievement[]>();
  for (const a of achievements) {
    const key = (a.metadata?.repository as string | undefined) ?? a.tags?.find((t) => t.includes("/")) ?? a.source;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(a);
  }
  const ordered = [...groups.entries()].sort((x, y) => y[1].length - x[1].length);

  const lines = [head("Achievements by Project", period, achievements.length), ""];
  for (const [project, items] of ordered) {
    lines.push(`\n## ${project}  _(${items.length})_\n`);
    for (const a of items) {
      const link = a.url ? `[${a.title}](${a.url})` : a.title;
      lines.push(`- ${link}  _(${formatDate(a.date)})_`);
    }
  }
  return lines.join("\n") + "\n";
}

/** High-level summary: counts by source/type plus recent highlights. */
function executiveSummary(achievements: Achievement[], period: Period): string {
  const bySource = tally(achievements, (a) => a.source);
  const byType = tally(achievements, (a) => a.type);

  const lines = [head("Executive Summary", period, achievements.length), ""];
  lines.push(`## Overview\n`);
  lines.push(`Contributed **${achievements.length}** achievements during this period.\n`);

  lines.push(`## By Source\n`);
  for (const [k, v] of sortTally(bySource)) lines.push(`- **${k}**: ${v}`);
  lines.push(`\n## By Type\n`);
  for (const [k, v] of sortTally(byType)) lines.push(`- **${k}**: ${v}`);

  lines.push(`\n## Highlights\n`);
  for (const a of achievements.slice(0, 10)) {
    const link = a.url ? `[${a.title}](${a.url})` : a.title;
    lines.push(`- ${link}  _(${formatDate(a.date)})_`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Brag sheet — a self-advocacy summary for reviews, promo packets, and 1:1s.
 * Leads with headline numbers, then the top wins per project. This is the
 * open-source stand-in for the original project's "talking points" generator.
 */
function bragSheet(achievements: Achievement[], period: Period): string {
  const bySource = tally(achievements, (a) => a.source);
  const projects = new Map<string, Achievement[]>();
  for (const a of achievements) {
    const key =
      (a.metadata?.repository as string | undefined) ??
      (a.metadata?.project as string | undefined) ??
      a.tags?.find((t) => t.includes("/")) ??
      a.source;
    let project = projects.get(key);
    if (!project) {
      project = [];
      projects.set(key, project);
    }
    project.push(a);
  }
  const ranked = [...projects.entries()].sort((x, y) => y[1].length - x[1].length);

  const lines = [head("Brag Sheet", period, achievements.length), ""];
  lines.push(`## Highlights\n`);
  lines.push(`- Delivered **${achievements.length}** tracked contributions this period.`);
  lines.push(`- Spanned **${Object.keys(bySource).length}** systems: ${sortTally(bySource).map(([k, v]) => `${k} (${v})`).join(", ")}.`);
  if (ranked[0]) lines.push(`- Most active in **${ranked[0][0]}** with ${ranked[0][1].length} contributions.`);

  lines.push(`\n## Top wins by area\n`);
  for (const [project, items] of ranked.slice(0, 8)) {
    lines.push(`### ${project}  _(${items.length})_`);
    for (const a of items.slice(0, 5)) {
      const link = a.url ? `[${a.title}](${a.url})` : a.title;
      lines.push(`- ${link}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Compensation / promo briefing. Leads with quantified impact (the numbers),
 * ranks the highest-impact work, and lays out structured talking points for the
 * conversation. Numbers come from collector enrichment — run `collect --enrich`
 * (GitHub) and include Jira/Slack for the fullest picture.
 */
function compensation(achievements: Achievement[], period: Period): string {
  const m = computeMetrics(achievements);
  const months = periodMonths(period);
  const perMonth = (n: number): number => (months ? Math.round(n / months) : n);

  const lines = [head("Compensation Briefing", period, achievements.length), ""];

  lines.push(`## The numbers\n`);
  const rows: Array<[string, number, number]> = [
    ["Total tracked contributions", m.total, perMonth(m.total)],
    ["Pull requests merged", m.prsMerged, perMonth(m.prsMerged)],
    ["Issues resolved/closed", m.issuesResolved + m.issuesClosed, perMonth(m.issuesResolved + m.issuesClosed)],
    ["Story points delivered", m.storyPoints, perMonth(m.storyPoints)],
    ["Lines added", m.additions, perMonth(m.additions)],
    ["Lines removed", m.deletions, perMonth(m.deletions)],
    ["Files changed", m.filesChanged, perMonth(m.filesChanged)],
    ["Commits", m.commits, perMonth(m.commits)],
    ["Docs/pages authored", m.pagesCreated, perMonth(m.pagesCreated)],
    ["Peer kudos received", m.kudos, perMonth(m.kudos)],
  ];
  lines.push(`| Metric | Total | Per month |`, `|---|--:|--:|`);
  for (const [label, total, pm] of rows) {
    if (total) lines.push(`| ${label} | ${total.toLocaleString()} | ${pm.toLocaleString()} |`);
  }
  if (m.additions === 0 && m.commits === 0) {
    lines.push(`\n> _Tip: run \`collect --enrich\` to populate code-volume metrics (lines, files, commits)._`);
  }

  lines.push(`\n## Highest-impact work\n`);
  for (const a of topByImpact(achievements, 10)) {
    const link = a.url ? `[${a.title}](${a.url})` : a.title;
    lines.push(`- ${link}`);
  }

  lines.push(`\n## Talking points\n`);
  lines.push(`**Opener (30 seconds):** Over this period I delivered ${m.total} tracked contributions` +
    `${m.prsMerged ? `, including ${m.prsMerged} merged pull requests` : ""}` +
    `${m.storyPoints ? ` and ${m.storyPoints} story points` : ""} — consistent, measurable output across the team's priorities.`);
  lines.push(`\n**Scope & impact:**`);
  if (m.additions) lines.push(`- Shipped ${m.additions.toLocaleString()} lines across ${m.filesChanged.toLocaleString()} files in ${m.commits.toLocaleString()} commits.`);
  if (m.issuesResolved + m.issuesClosed) lines.push(`- Closed ${m.issuesResolved + m.issuesClosed} tracked issues, keeping delivery predictable.`);
  if (m.pagesCreated) lines.push(`- Authored ${m.pagesCreated} docs/pages, multiplying impact beyond my own code.`);
  lines.push(`\n**Recognition:** ${m.kudos ? `${m.kudos} peer kudos this period — evidence the work is valued across the org.` : `(Collect Slack to surface peer recognition.)`}`);
  lines.push(`\n**The ask:** Given this sustained, quantified impact, I'd like to discuss leveling/compensation that reflects it.`);

  return lines.join("\n") + "\n";
}

/** Whole months in the period (for per-month rates); 0 when unknown. */
function periodMonths(period: Period): number {
  if (!period?.since || !period?.until) return 0;
  const ms = new Date(period.until).getTime() - new Date(period.since).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.4)));
}

// ── helpers ──────────────────────────────────────────────────────────────
function head(title: string, period: Period, count: number): string {
  const range =
    period?.since && period?.until ? `${formatDate(period.since)} – ${formatDate(period.until)}` : "all time";
  return `# ${title}\n\n**Period:** ${range}  \n**Achievements:** ${count}`;
}

function tally(list: Achievement[], keyFn: (a: Achievement) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of list) {
    const k = keyFn(a);
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

function sortTally(obj: Record<string, number>): Array<[string, number]> {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}
