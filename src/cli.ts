import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "./store.ts";
import { resolveAuth } from "./atlassian.ts";
import { register, get, names } from "./collectors/registry.ts";
import { github } from "./collectors/github.ts";
import { jira } from "./collectors/jira.ts";
import { confluence } from "./collectors/confluence.ts";
import { slack } from "./collectors/slack.ts";
import { render, templates } from "./reports/markdown.ts";
import { computeMetrics } from "./reports/impact.ts";
import { salaryAnalysis, type Bands } from "./reports/salary.ts";
import { toCsv } from "./reports/csv.ts";
import { writePdf } from "./reports/pdf.ts";
import { parsePeriod, parseDate } from "./dates.ts";
import * as cfg from "./config.ts";

// Register the built-in collectors. Third parties register their own before
// invoking the CLI, or use the library API directly.
[github, jira, confluence, slack].forEach(register);

const DEFAULT_DB = `${process.env.HOME}/.local/share/bragkit/bragkit.db`;

const HELP = `bragkit — track professional achievements (zero-dependency core)

Usage:
  brag collect [--source a,b] [--since <date>] [--until <date>] [--enrich] [--verbose]
               [--include-created] [--include-updated]
               [--github-repos o/r,…] [--jira-projects K,…] [--confluence-spaces S,…]
               [--slack-channels c,…] [--db <path>] [--json]
  brag report  <period> [--template <name>] [--format markdown|json|csv|pdf]
               [--bands <file>] [--db <path>] [--out <file>]
  brag export  [--db <path>] [--out <file>]      Write achievements.json for the dashboard
  brag list    [--db <path>] [--limit <n>]
  brag config  [show|init|set <k> <v>|path]      Readiness check, or manage saved config
  brag runs    [--db <path>] [--limit <n>]       Show the collection-run audit trail
  brag help

Dates:  ISO (2025-06-01), "30 days ago", "today".
Period: "2025", "Q1 2025", "2025-01-01 to 2025-06-30", or a single date.
When --since is omitted, collect resumes from each source's last successful run.
Templates: ${templates().join(", ")}
Collectors: ${names().join(", ")}
Config: ${cfg.DEFAULT_CONFIG_PATH}
Default DB: ${DEFAULT_DB}`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "collect": return collect(rest);
    case "report": return report(rest);
    case "export": return exportJson(rest);
    case "list": return list(rest);
    case "config": return configCmd(rest);
    case "runs": return runs(rest);
    case undefined:
    case "help":
    case "--help":
    case "-h": console.log(HELP); return 0;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
}

interface Summary {
  collected: number;
  bySource: Record<string, number>;
  errors: string[];
}

async function collect(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args, allowPositionals: false,
    options: {
      // No defaults on source/since/db: an absent flag must read as `undefined`
      // so saved config (then DEFAULTS) can supply the value via mergeFlags.
      source: { type: "string" },                    // one name, or comma-separated
      since: { type: "string" },                     // omitted → incremental (last run)
      until: { type: "string", default: "today" },
      db: { type: "string" },
      json: { type: "boolean", default: false },
      enrich: { type: "boolean", default: false },   // github: fetch per-PR stats
      verbose: { type: "boolean", default: false },
      "include-created": { type: "boolean", default: false },  // jira: also reporter-created issues
      "include-updated": { type: "boolean", default: false },  // confluence: also pages you edited
      "github-repos": { type: "string" },            // filter: owner/name,owner/name2
      "jira-projects": { type: "string" },            // filter: KEY1,KEY2
      "confluence-spaces": { type: "string" },        // filter: SPACE1,SPACE2
      "slack-channels": { type: "string" },           // filter: general,eng
    },
  });

  // Effective options: explicit flag > saved config > DEFAULTS.
  const eff = cfg.mergeFlags(cfg.load(), {
    db: values.db,
    since: values.since,
    sources: values.source ? values.source.split(",").map((s) => s.trim()) : undefined,
    repos: csvList(values["github-repos"]),
    projects: csvList(values["jira-projects"]),
    spaces: csvList(values["confluence-spaces"]),
    channels: csvList(values["slack-channels"]),
  });

  const db = eff.db ?? DEFAULT_DB;
  const until = parseDate(values.until).toISOString();
  const sources = eff.sources.length ? eff.sources : names();
  const verbose = values.verbose || !values.json;

  const store = openStore(db);
  const summary: Summary = { collected: 0, bySource: {}, errors: [] };
  for (const name of sources) {
    const collector = get(name);
    if (!collector) { summary.errors.push(`No such collector: ${name}`); continue; }

    // Incremental: an explicit --since/config wins; otherwise resume from this
    // source's last successful run; otherwise fall back to 30 days.
    const since =
      (eff.since ? parseDate(eff.since).toISOString() : null) ??
      store.lastSuccess(name) ??
      parseDate("30 days ago").toISOString();

    if (verbose) process.stderr.write(`Collecting from ${name} since ${since.slice(0, 10)}…\n`);
    const { achievements, errors } = await collector.collect({
      since, until,
      enrich: values.enrich,
      includeCreated: values["include-created"],
      includeUpdated: values["include-updated"],
      repos: eff.repos, projects: eff.projects, spaces: eff.spaces, channels: eff.channels,
    });
    summary.collected += store.upsertMany(achievements);
    summary.bySource[name] = achievements.length;
    summary.errors.push(...errors);
    store.recordRun({ source: name, since, until, collected: achievements.length, errors });
  }
  store.close();

  if (values.json) {
    console.log(JSON.stringify({ ...summary, until }, null, 2));
  } else {
    process.stderr.write(`\n✓ Collected ${summary.collected} achievement(s) into ${db}\n`);
    for (const [s, n] of Object.entries(summary.bySource)) process.stderr.write(`  ${s}: ${n}\n`);
    for (const e of summary.errors) process.stderr.write(`  ! ${e}\n`);
  }
  return summary.errors.length && !summary.collected ? 1 : 0;
}

function report(args: string[]): number {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      template: { type: "string", default: "timeline" },
      format: { type: "string", default: "markdown" }, // markdown | json | csv | pdf
      db: { type: "string", default: DEFAULT_DB },
      out: { type: "string" },
      bands: { type: "string" }, // optional market-bands JSON, appended to compensation
    },
  });
  const period = parsePeriod(positionals[0] ?? "2025");
  const store = openStore(values.db);
  const achievements = store.query({ since: period.since, until: period.until });
  store.close();

  // CSV: structured rows, write or stream.
  if (values.format === "csv") {
    const out = toCsv(achievements);
    if (values.out) { writeOut(values.out, out); process.stderr.write(`✓ Wrote csv report → ${values.out}\n`); }
    else process.stdout.write(out);
    return 0;
  }

  // PDF: render the chosen template to markdown, then print via headless Chrome.
  if (values.format === "pdf") {
    const out = values.out ?? `brag-${values.template}.pdf`;
    const md = withSalary(render(values.template, achievements, period), values, achievements);
    const res = writePdf(md, out, { title: values.template });
    if (res.ok) process.stderr.write(`✓ Wrote pdf report → ${out}\n`);
    else process.stderr.write(`! No Chrome/Chromium/Edge found — wrote HTML instead → ${res.html}\n  Set CHROME_PATH, or open that file and print to PDF.\n`);
    return res.ok ? 0 : 2;
  }

  const output =
    values.format === "json"
      ? JSON.stringify({ period, count: achievements.length, achievements }, null, 2)
      : withSalary(render(values.template, achievements, period), values, achievements);

  if (values.out) {
    writeOut(values.out, output);
    process.stderr.write(`✓ Wrote ${values.format === "json" ? "json" : values.template} report → ${values.out}\n`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

/** Append a salary-band analysis to a compensation report when --bands is given. */
function withSalary(
  markdown: string,
  values: { template: string; bands?: string },
  achievements: Parameters<typeof computeMetrics>[0]
): string {
  if (values.template !== "compensation" || !values.bands) return markdown;
  let bands: Bands;
  try {
    bands = JSON.parse(readFileSync(values.bands, "utf8")) as Bands;
  } catch (e) {
    process.stderr.write(`! Could not read --bands file: ${e instanceof Error ? e.message : String(e)}\n`);
    return markdown;
  }
  return markdown + "\n\n" + salaryAnalysis(computeMetrics(achievements), bands);
}

function exportJson(args: string[]): number {
  const { values } = parseArgs({
    args, allowPositionals: false,
    options: {
      db: { type: "string", default: DEFAULT_DB },
      out: { type: "string", default: "web/public/achievements.json" },
    },
  });
  const store = openStore(values.db);
  const achievements = store.query({});
  const stats = store.stats({});
  store.close();
  writeOut(values.out, JSON.stringify({ generatedAt: new Date().toISOString(), stats, achievements }, null, 2));
  process.stderr.write(`✓ Exported ${achievements.length} achievement(s) → ${values.out}\n`);
  return 0;
}

function list(args: string[]): number {
  const { values } = parseArgs({
    args, allowPositionals: false,
    options: { db: { type: "string", default: DEFAULT_DB }, limit: { type: "string", default: "20" } },
  });
  const store = openStore(values.db);
  const rows = store.query({ limit: Number(values.limit) });
  store.close();
  for (const a of rows) console.log(`${a.date.slice(0, 10)}  ${a.source.padEnd(10)}  ${a.title}`);
  return 0;
}

function runs(args: string[]): number {
  const { values } = parseArgs({
    args, allowPositionals: false,
    options: { db: { type: "string", default: DEFAULT_DB }, limit: { type: "string", default: "20" } },
  });
  const store = openStore(values.db);
  const rows = store.runs(Number(values.limit));
  store.close();
  if (!rows.length) { console.log("No collection runs recorded yet. Run `brag collect`."); return 0; }
  for (const r of rows) {
    const mark = r.status === "success" ? "✓" : "!";
    console.log(`${mark} ${r.created_at.slice(0, 19).replace("T", " ")}  ${r.source.padEnd(11)} ${String(r.collected).padStart(4)} collected${r.errors.length ? `  (${r.errors.length} error[s])` : ""}`);
  }
  return 0;
}

/** Route `config` subcommands; bare `config` runs the readiness check. */
function configCmd(args: string[]): number {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case "ready":
      return configReady();
    case "show":
      console.log(JSON.stringify(cfg.load(), null, 2));
      return 0;
    case "path":
      console.log(cfg.DEFAULT_CONFIG_PATH);
      return 0;
    case "init": {
      if (Object.keys(cfg.load()).length) {
        process.stderr.write(`Config already exists at ${cfg.DEFAULT_CONFIG_PATH}\n`);
        return 0;
      }
      cfg.save(cfg.DEFAULTS);
      process.stderr.write(`✓ Wrote default config → ${cfg.DEFAULT_CONFIG_PATH}\n`);
      return 0;
    }
    case "set": {
      const [key, value] = rest;
      if (!key || value === undefined) {
        console.error("usage: brag config set <key> <value>   (e.g. brag config set github.repos '[\"o/r\"]')");
        return 1;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { parsed = value; } // JSON if possible, else raw string
      cfg.save(cfg.set(cfg.load(), key, parsed));
      process.stderr.write(`✓ Set ${key} in ${cfg.DEFAULT_CONFIG_PATH}\n`);
      return 0;
    }
    default:
      console.error(`Unknown config subcommand: ${sub}. Try: show | init | set | path`);
      return 1;
  }
}

/** Report which collectors are ready to run, and how to configure the rest. */
function configReady(): number {
  const checks: Array<[string, boolean, string]> = [
    ["github", ghReady(), "Install `gh` and run `gh auth login`."],
    ["jira", atlassianReady(), "Set ATLASSIAN_SITE, ATLASSIAN_EMAIL, and a token (ATLASSIAN_API_TOKEN or BRAGKIT_OP_TOKEN_REF)."],
    ["confluence", atlassianReady(), "Shares Atlassian credentials with Jira."],
    ["slack", !!(process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN), "Set SLACK_USER_TOKEN (preferred) or SLACK_BOT_TOKEN."],
  ];
  console.log("Collector readiness:\n");
  for (const [name, ready, hint] of checks) {
    console.log(`  ${ready ? "✓" : "✗"} ${name.padEnd(11)} ${ready ? "ready" : hint}`);
  }
  const readyCount = checks.filter((c) => c[1]).length;
  console.log(`\n${readyCount}/${checks.length} collectors ready.`);
  return 0;
}

function ghReady(): boolean {
  return spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status === 0;
}

function atlassianReady(): boolean {
  return !("error" in resolveAuth());
}

// ── helpers ────────────────────────────────────────────────────────────────
function openStore(path: string): Store {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return new Store(path);
}

function writeOut(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

/**
 * Split a comma-separated flag into a trimmed array. Returns `undefined` when
 * the flag was absent so `mergeFlags` can defer to saved config; an empty/
 * present value yields `[]` (an explicit "none", which wins over config).
 */
function csvList(v: string | undefined): string[] | undefined {
  return v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean);
}
