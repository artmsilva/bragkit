import type { Metrics } from "./impact.ts";

/**
 * Salary-conversation prep. Pure function over the metrics object returned by
 * `computeMetrics` (see impact.ts) plus a user-supplied `bands` file.
 *
 * IMPORTANT: this renders only what the caller provides. It does NOT fabricate
 * the user's current salary, invent market figures, or claim a "fair" number.
 * It surfaces the quantified scope/impact next to whatever bands the user
 * researched, names the nearest band by level, and frames the whole thing as
 * inputs for a conversation — not a guarantee or an offer.
 */

/** A single researched compensation band. */
export interface Band {
  level: string;
  median: number;
}

/** A user-supplied bands file: an optional currency/note plus a list of bands. */
export interface Bands {
  currency?: string;
  note?: string;
  bands: Band[];
}

export function salaryAnalysis(metrics: Metrics, bands: Bands): string {
  const m = metrics || ({} as Partial<Metrics>);
  const currency = bands?.currency ?? "";
  const list = Array.isArray(bands?.bands) ? bands.bands : [];

  const lines = ["# Salary Conversation Prep", ""];
  lines.push(
    "> These are **inputs for a conversation**, not a valuation or a guarantee. " +
      "The numbers below are the figures you supplied plus your own tracked output — " +
      "nothing here is a market estimate or a promise.\n",
  );

  // ── Scope & impact (straight from the metrics, no invention) ─────────────
  lines.push("## Your scope this period\n");
  const scope: Array<[string, number | undefined]> = [
    ["Tracked contributions", m.total],
    ["Pull requests merged", m.prsMerged],
    ["Issues resolved/closed", (m.issuesResolved ?? 0) + (m.issuesClosed ?? 0)],
    ["Story points delivered", m.storyPoints],
    ["Lines added", m.additions],
    ["Files changed", m.filesChanged],
    ["Commits", m.commits],
    ["Docs/pages authored", m.pagesCreated],
    ["Peer kudos received", m.kudos],
  ];
  lines.push("| Signal | Value |", "|---|--:|");
  for (const [label, value] of scope) {
    if (value) lines.push(`| ${label} | ${Number(value).toLocaleString()} |`);
  }

  // ── Bands the user provided ──────────────────────────────────────────────
  lines.push("\n## Your researched bands\n");
  if (list.length === 0) {
    lines.push("_No bands provided. Add a bands file to compare against levels._");
    return lines.join("\n") + "\n";
  }
  if (bands?.note) lines.push(`> ${bands.note}\n`);
  lines.push(`| Level | Median${currency ? ` (${currency})` : ""} |`, "|---|--:|");
  for (const b of list) {
    const median = Number(b?.median);
    const shown = Number.isFinite(median) && median > 0 ? median.toLocaleString() : "_(not set)_";
    lines.push(`| ${b?.level ?? "—"} | ${shown} |`);
  }

  // ── Nearest band: purely positional, with an explicit "you decide" caveat.
  // We do NOT map metrics → money. We just name the median-of-medians band as a
  // neutral anchor so the user has a starting reference point to react to.
  const withMedians = list.filter((b) => Number.isFinite(Number(b?.median)) && Number(b.median) > 0);
  lines.push("\n## Where to anchor\n");
  if (withMedians.length === 0) {
    lines.push(
      "Your bands file has placeholder medians (0). Replace them with researched " +
        "figures, then re-run to see a suggested anchor band.",
    );
  } else {
    const sorted = [...withMedians].sort((a, b) => Number(a.median) - Number(b.median));
    const nearest = sorted[Math.floor((sorted.length - 1) / 2)];
    lines.push(
      `Nearest band by your figures: **${nearest.level}** ` +
        `(median ${currency ? currency + " " : ""}${Number(nearest.median).toLocaleString()}).`,
    );
    lines.push(
      "\nUse your scope above to argue where you sit relative to this band — " +
        "you own that judgement, not this tool. Bring the band table and the scope " +
        "numbers to the conversation as evidence, and ask where the org places you.",
    );
  }

  return lines.join("\n") + "\n";
}
