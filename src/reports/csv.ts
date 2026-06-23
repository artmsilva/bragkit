import type { Achievement } from "../achievement.ts";

/**
 * CSV export for achievements. Pure and deterministic — no clock, no I/O — so
 * the same achievements always yield byte-identical output (handy for tests and
 * diffs). Emits RFC 4180 CSV: a fixed header row followed by one row per
 * achievement.
 */

type Column = "id" | "source" | "type" | "title" | "date" | "url" | "tags";

/** The column order. `tags` is collapsed into a single ";"-joined field. */
const COLUMNS: Column[] = ["id", "source", "type", "title", "date", "url", "tags"];

/**
 * Escape a single CSV field per RFC 4180: if it contains a comma, double quote,
 * CR, or LF, wrap the whole field in double quotes and double any internal
 * quotes. Everything is stringified first so numbers/undefined don't blow up.
 */
function escapeField(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Pull the printable value for one column from an achievement. */
function cell(achievement: Achievement, column: Column): string {
  if (column === "tags") {
    const tags = Array.isArray(achievement.tags) ? achievement.tags : [];
    return tags.join(";");
  }
  return achievement[column] ?? "";
}

/**
 * Render achievements as an RFC 4180 CSV string (header + one row each).
 * Rows are CRLF-terminated, including a trailing CRLF after the last row.
 */
export function toCsv(achievements: Achievement[] = []): string {
  const rows = [COLUMNS.join(",")];
  for (const a of achievements) {
    rows.push(COLUMNS.map((col) => escapeField(cell(a, col))).join(","));
  }
  return rows.join("\r\n") + "\r\n";
}
