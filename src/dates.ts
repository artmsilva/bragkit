/**
 * Small, dependency-free date parsing for CLI ergonomics. Supports the handful
 * of period formats people actually type, and resolves a "period" string into
 * an explicit { since, until } ISO range.
 */

export interface Period {
  since: string;
  until: string;
}

/** Parse one date token: ISO date, or "N days ago", or "today". */
export function parseDate(input: string, { now = new Date() }: { now?: Date } = {}): Date {
  const s = String(input).trim().toLowerCase();
  if (s === "today" || s === "now") return new Date(now);

  const rel = s.match(/^(\d+)\s+days?\s+ago$/);
  if (rel) {
    const d = new Date(now);
    d.setDate(d.getDate() - Number(rel[1]));
    return d;
  }

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Unrecognized date: "${input}"`);
  }
  return d;
}

/**
 * Resolve a period string into a { since, until } ISO range.
 * Accepts: "2025", "Q1 2025", "2025-01-01 to 2025-03-31", or a single date
 * (treated as since → now).
 */
export function parsePeriod(period: string, { now = new Date() }: { now?: Date } = {}): Period {
  const s = String(period).trim();

  const range = s.split(/\s+to\s+/i);
  if (range.length === 2) {
    return { since: parseDate(range[0], { now }).toISOString(), until: endOfDay(parseDate(range[1], { now })) };
  }

  const year = s.match(/^(\d{4})$/);
  if (year) {
    const y = Number(year[1]);
    return { since: new Date(Date.UTC(y, 0, 1)).toISOString(), until: new Date(Date.UTC(y, 11, 31, 23, 59, 59)).toISOString() };
  }

  const quarter = s.match(/^q([1-4])\s+(\d{4})$/i);
  if (quarter) {
    const q = Number(quarter[1]);
    const y = Number(quarter[2]);
    const startMonth = (q - 1) * 3;
    return {
      since: new Date(Date.UTC(y, startMonth, 1)).toISOString(),
      until: new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59)).toISOString(),
    };
  }

  // Single date → from that date until now.
  return { since: parseDate(s, { now }).toISOString(), until: new Date(now).toISOString() };
}

function endOfDay(d: Date): string {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e.toISOString();
}

/** Format an ISO date as "Mon D, YYYY" for human-facing report text. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
