import { formatDate } from "../dates.ts";
import type { Achievement } from "../achievement.ts";
import type { Period } from "../dates.ts";

/**
 * Trend reporting — how achievement output is distributed over time. Pure
 * functions over the Achievement model, so they work regardless of which
 * collectors produced the data. Bucketing is done in UTC and is deterministic:
 * no Date.now(), no Math.random(), so the same input always yields the same
 * output (and tests stay stable).
 */

/** One calendar-month bucket of achievements. */
export interface MonthBucket {
  /** "YYYY-MM" */
  month: string;
  count: number;
  byType: Record<string, number>;
}

/**
 * Group achievements into calendar months.
 *
 * Returns an array of `{ month: "YYYY-MM", count, byType: { type: count } }`
 * sorted ascending by month. Months with no achievements are not emitted —
 * the result is sparse, reflecting only the months that actually have data.
 * Bucketing uses the UTC year/month of each achievement's `date` so the same
 * achievement always lands in the same bucket no matter the host timezone.
 */
export function groupByMonth(achievements: Achievement[]): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();
  for (const a of achievements) {
    const d = new Date(a.date);
    if (Number.isNaN(d.getTime())) continue; // skip unparseable dates rather than throw
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    let bucket = buckets.get(month);
    if (!bucket) {
      bucket = { month, count: 0, byType: {} };
      buckets.set(month, bucket);
    }
    bucket.count++;
    const type = a.type ?? "unknown";
    bucket.byType[type] = (bucket.byType[type] ?? 0) + 1;
  }
  return [...buckets.values()].sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0));
}

/**
 * Render a plain-text-friendly trend report: an H1, a per-month table
 * (Month | Count) and a simple ASCII bar per month scaled to the busiest
 * month. The bars use a block char so the report reads as a chart even in a
 * terminal or a plain-text diff.
 */
export function renderTrend(achievements: Achievement[], period: Period): string {
  const months = groupByMonth(achievements);
  const lines = [head("Achievement Trends", period, achievements.length), ""];

  if (months.length === 0) {
    lines.push("_No achievements in this period._\n");
    return lines.join("\n");
  }

  lines.push("## Per month\n");
  lines.push("| Month | Count |", "|---|--:|");
  for (const m of months) lines.push(`| ${m.month} | ${m.count} |`);

  const max = Math.max(...months.map((m) => m.count));
  const width = 24; // longest bar, in block chars
  lines.push("\n## Distribution\n");
  lines.push("```");
  for (const m of months) {
    const filled = max > 0 ? Math.round((m.count / max) * width) : 0;
    const bar = "█".repeat(filled) || (m.count > 0 ? "▏" : "");
    lines.push(`${m.month}  ${bar} ${m.count}`);
  }
  lines.push("```");

  return lines.join("\n") + "\n";
}

// ── helpers (kept local so this file stays self-contained) ─────────────────
function head(title: string, period: Period, count: number): string {
  const range =
    period?.since && period?.until ? `${formatDate(period.since)} – ${formatDate(period.until)}` : "all time";
  return `# ${title}\n\n**Period:** ${range}  \n**Achievements:** ${count}`;
}
