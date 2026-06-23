import type { Achievement } from "../achievement.ts";

/**
 * A collector is anything that can turn a time range into achievements.
 * The contract is one async function — keep it that small and any data source
 * (a REST API, a local git log, a CSV) can plug in without touching the core.
 */
export interface CollectOptions {
  /** ISO start of range (inclusive). */
  since: string;
  /** ISO end of range (inclusive). */
  until: string;
  /** GitHub: fetch per-PR stats via GraphQL (slower). */
  enrich?: boolean;
  /** GitHub: restrict to these "owner/name" repositories. */
  repos?: string[];
  /** Jira: restrict to these project keys. */
  projects?: string[];
  /** Confluence: restrict to these space keys. */
  spaces?: string[];
  /** Slack: restrict to these channel names. */
  channels?: string[];
  /** Jira: also collect issues you created (reporter), not just resolved. */
  includeCreated?: boolean;
  /** Confluence: also collect pages you updated but didn't create. */
  includeUpdated?: boolean;
}

export interface CollectResult {
  achievements: Achievement[];
  /** Non-fatal problems worth surfacing to the user. */
  errors: string[];
}

export interface Collector {
  name: string;
  collect(opts: CollectOptions): Promise<CollectResult>;
}

const registry = new Map<string, Collector>();

/** Register a collector under its `name`. */
export function register(collector: Collector): Collector {
  if (!collector?.name || typeof collector.collect !== "function") {
    throw new Error("A collector must have a `name` and a `collect(opts)` function.");
  }
  registry.set(collector.name, collector);
  return collector;
}

/** Look up a registered collector by name. */
export function get(name: string): Collector | undefined {
  return registry.get(name);
}

/** List the names of all registered collectors. */
export function names(): string[] {
  return [...registry.keys()];
}
