/**
 * The Achievement is bragkit's single unit of record. Every collector — GitHub,
 * or anything you write — normalizes its source data into this shape, and every
 * report reads only this shape. Keeping the model this small is what lets the
 * storage and report layers stay source-agnostic.
 */
export interface Achievement {
  /** Stable, idempotent id: `${source}:${type}:${externalId}`. Re-collecting updates in place. */
  id: string;
  /** Where it came from, e.g. "github". */
  source: string;
  /** What it is, e.g. "pr_merged". */
  type: string;
  /** One-line human summary. */
  title: string;
  /** Longer body (markdown allowed). */
  description: string;
  /** Canonical link back to the source. */
  url: string;
  /** ISO-8601 timestamp the achievement is dated to. */
  date: string;
  /** Free-form labels (used for grouping/filtering). */
  tags: string[];
  /** Source-specific extras; put quantifiable signal here (additions, storyPoints, …). */
  metadata: Record<string, unknown>;
}

/** A raw, partially-formed achievement as produced by a collector before normalization. */
export type RawAchievement = Partial<Achievement> &
  Pick<Achievement, "id" | "source" | "type" | "title" | "date">;

/** Build the stable id for an achievement from its source coordinates. */
export function makeId(source: string, type: string, externalId: string | number): string {
  return `${source}:${type}:${externalId}`;
}

/**
 * Validate and normalize a raw object into a well-formed Achievement.
 * Throws on missing required fields so collector bugs surface early rather than
 * writing junk rows. Returns a frozen, normalized copy.
 */
export function normalize(raw: RawAchievement): Readonly<Achievement> {
  for (const field of ["id", "source", "type", "title", "date"] as const) {
    if (!raw[field] || typeof raw[field] !== "string") {
      throw new Error(`Achievement is missing required string field: ${field}`);
    }
  }
  const date = new Date(raw.date);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Achievement has an invalid date: ${raw.date}`);
  }
  return Object.freeze({
    id: raw.id,
    source: raw.source,
    type: raw.type,
    title: raw.title.trim(),
    description: raw.description ?? "",
    url: raw.url ?? "",
    date: date.toISOString(),
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.map(String))] : [],
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  });
}
