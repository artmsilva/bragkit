import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Persistent user config for bragkit — a single JSON file that lets users
 * pin their default DB, the collectors they care about, and per-source
 * filters (repos, projects, spaces, channels) so they don't retype flags on
 * every `brag collect`. Zero dependencies: just `node:fs` + JSON.
 *
 * Design: load/save are the only impure functions (they touch the disk).
 * get/set/mergeFlags are pure and operate on plain objects, so they're
 * trivially testable and reusable from the library API.
 */

/**
 * The supported config shape, documented as defaults. Anything `mergeFlags`
 * doesn't see from the file or the CLI falls back to these.
 *
 * - `db`        : default SQLite path (null → caller decides, e.g. the CLI's own default).
 * - `sources`   : collector names to run when none is passed (empty → all registered).
 * - `since`     : default lookback for `collect` (null → the CLI default / incremental).
 * - `github`    : `{ repos: ["owner/name", …] }`   filter.
 * - `jira`      : `{ projects: ["KEY", …] }`        filter.
 * - `confluence`: `{ spaces: ["SPACE", …] }`        filter.
 * - `slack`     : `{ channels: ["general", …] }`    filter.
 */
export interface Config {
  db?: string | null;
  sources?: string[];
  since?: string | null;
  github?: { repos?: string[] };
  jira?: { projects?: string[] };
  confluence?: { spaces?: string[] };
  slack?: { channels?: string[] };
  /** Forward-compatible: unknown keys are tolerated (and let `set` write any dotted key). */
  [key: string]: unknown;
}

/** The flags `mergeFlags` accepts — only those the caller explicitly passed. */
export interface MergeFlagsInput {
  db?: string;
  sources?: string[];
  since?: string;
  repos?: string[];
  projects?: string[];
  spaces?: string[];
  channels?: string[];
}

/** The effective, fully-resolved collection options `mergeFlags` returns. */
export interface MergedFlags {
  db: string | null;
  sources: string[];
  since: string | null;
  repos: string[];
  projects: string[];
  spaces: string[];
  channels: string[];
}

/**
 * Default config path. Honors `XDG_CONFIG_HOME` (the freedesktop base-dir
 * spec) and falls back to `~/.config` so it lands where other CLIs keep
 * their config.
 */
export const DEFAULT_CONFIG_PATH: string = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "bragkit",
  "config.json"
);

export const DEFAULTS: Config = Object.freeze({
  db: null,
  sources: [],
  since: null,
  github: { repos: [] },
  jira: { projects: [] },
  confluence: { spaces: [] },
  slack: { channels: [] },
});

/**
 * Read and parse the config file. Never throws: a missing file, an
 * unreadable file, or invalid JSON all yield `{}` — config is an
 * optional convenience, not a hard dependency.
 */
export function load(path: string = DEFAULT_CONFIG_PATH): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {}; // missing / unreadable → no config
  }
  try {
    const parsed: unknown = JSON.parse(text);
    // Guard against a JSON file whose top level isn't an object (e.g. `[]`, `42`).
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Config)
      : {};
  } catch {
    return {}; // invalid JSON → treat as no config rather than crashing the CLI
  }
}

/**
 * Write config as pretty JSON, creating the containing directory if needed.
 */
export function save(config: Config, path: string = DEFAULT_CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Read a possibly-nested value by dotted key, e.g. `get(cfg, "github.repos")`
 * or `get(cfg, "db")`. Returns `undefined` if any segment is missing.
 */
export function get(config: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (acc, part) =>
      acc != null && typeof acc === "object"
        ? (acc as Record<string, unknown>)[part]
        : undefined,
    config
  );
}

/**
 * Set a value by dotted key. Pure: returns a NEW object (and clones the nodes
 * along the touched path) rather than mutating the input, so callers can keep
 * the prior config around. Untouched branches are shared by reference.
 */
export function set(
  config: Record<string, unknown> | null | undefined,
  key: string,
  value: unknown
): Record<string, unknown> {
  const parts = key.split(".");
  const root: Record<string, unknown> = { ...(config ?? {}) };
  let node: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = node[part];
    // Clone the branch so we never mutate the caller's nested objects.
    node[part] =
      existing != null && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  return root;
}

/**
 * Compute the effective collection options from (in increasing precedence):
 * DEFAULTS  <  saved config  <  explicitly-passed CLI flags.
 *
 * Only flags the caller actually passed should override config — so pass
 * `undefined` for flags the user omitted (don't pre-fill them with parseArgs
 * defaults). Empty arrays/strings ARE treated as "passed" and will win; pass
 * `undefined` to defer to config.
 */
export function mergeFlags(
  config: Config = {},
  flags: MergeFlagsInput = {}
): MergedFlags {
  const cfg = config as Record<string, unknown>;
  const pick = <T>(flagVal: T | undefined, key: string, fallback: T): T =>
    flagVal !== undefined ? flagVal : (valueOr(get(cfg, key), fallback) as T);

  return {
    db: pick(flags.db, "db", DEFAULTS.db ?? null),
    sources: pick(flags.sources, "sources", DEFAULTS.sources ?? []),
    since: pick(flags.since, "since", DEFAULTS.since ?? null),
    repos: pick(flags.repos, "github.repos", DEFAULTS.github?.repos ?? []),
    projects: pick(flags.projects, "jira.projects", DEFAULTS.jira?.projects ?? []),
    spaces: pick(flags.spaces, "confluence.spaces", DEFAULTS.confluence?.spaces ?? []),
    channels: pick(flags.channels, "slack.channels", DEFAULTS.slack?.channels ?? []),
  };
}

/** config value if present (not undefined/null), else the default. */
function valueOr(configVal: unknown, fallback: unknown): unknown {
  return configVal !== undefined && configVal !== null ? configVal : fallback;
}
