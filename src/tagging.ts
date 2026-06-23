import type { Achievement } from "./achievement.ts";

/**
 * Auto-tagging and cross-source dedup hints. Applied centrally in the store so
 * every achievement — whatever collector produced it — gets the same treatment.
 *
 * The key idea: most work has a tracker id (a Jira/Linear-style ticket key like
 * `PROJ-1234`) that shows up in PR titles, commit messages, and the ticket itself.
 * Extracting that key lets a GitHub PR and its Jira issue carry the *same* tag,
 * so reports/dashboards can group "the same piece of work" across sources.
 */

// PROJECT-NNN — uppercase project key (2–10 chars) + dash + number.
const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;

// Prefixes that look like ticket keys but aren't — common tech/standards terms.
const NON_TICKET_PREFIXES = new Set([
  "UTF", "UTF8", "UTF16", "ISO", "SHA", "MD", "RFC", "CVE", "HTTP", "HTTPS",
  "OAUTH", "BASE", "ES", "TS", "I18N", "L10N", "A11Y", "EC2", "S3", "IPV4", "IPV6",
]);

/** Extract distinct tracker ticket keys (e.g. "PROJ-1234") from free text. */
export function extractTicketKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(TICKET_RE)) {
    if (NON_TICKET_PREFIXES.has(m[1])) continue;
    keys.add(`${m[1]}-${m[2]}`);
  }
  return [...keys];
}

/**
 * Enrich an achievement with derived tags and dedup hints, idempotently:
 * - ticket keys found in the title/description become tags
 * - `metadata.relatedKeys` records those keys for cross-source linking
 * - tags are normalized (trimmed, de-duped, no empties)
 *
 * Returns the same object when there's nothing to add, so it's safe to call on
 * every upsert.
 */
export function autoTag(a: Readonly<Achievement>): Achievement {
  const keys = extractTicketKeys(`${a.title}\n${a.description}`);
  const tags = normalizeTags([...a.tags, ...keys]);

  const sameTags = tags.length === a.tags.length && tags.every((t, i) => t === a.tags[i]);
  if (!keys.length && sameTags) return a as Achievement;

  return {
    ...a,
    tags,
    metadata: keys.length ? { ...a.metadata, relatedKeys: keys } : { ...a.metadata },
  };
}

/** Trim, drop empties, and de-duplicate tags while preserving first-seen order. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
