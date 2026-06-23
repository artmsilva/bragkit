import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG_PATH,
  DEFAULTS,
  load,
  save,
  get,
  set,
  mergeFlags,
} from "../src/config.ts";

// Deterministic temp path keyed on the process id (no Date.now / Math.random).
const TMP = join(tmpdir(), `bragkit-config-test-${process.pid}.json`);

function cleanup() {
  try {
    rmSync(TMP, { force: true });
  } catch {
    /* ignore */
  }
}

test("DEFAULT_CONFIG_PATH ends in bragkit/config.json", () => {
  assert.match(DEFAULT_CONFIG_PATH, /[/\\]bragkit[/\\]config\.json$/);
});

test("load of a missing file returns {} and never throws", () => {
  cleanup();
  assert.deepEqual(load(TMP), {});
});

test("load of invalid JSON returns {} (does not throw)", () => {
  cleanup();
  writeFileSync(TMP, "{ this is not json");
  assert.deepEqual(load(TMP), {});
  cleanup();
});

test("load of non-object JSON (array/number) returns {}", () => {
  cleanup();
  writeFileSync(TMP, "[1, 2, 3]");
  assert.deepEqual(load(TMP), {});
  cleanup();
});

test("save + load round-trips a config object", () => {
  cleanup();
  const cfg = {
    db: "/tmp/x.db",
    sources: ["github", "jira"],
    github: { repos: ["o/r"] },
  };
  save(cfg, TMP);
  assert.deepEqual(load(TMP), cfg);
  cleanup();
});

test("get reads dotted keys, undefined for missing", () => {
  const cfg = { db: "/d", github: { repos: ["o/r"] } };
  assert.equal(get(cfg, "db"), "/d");
  assert.deepEqual(get(cfg, "github.repos"), ["o/r"]);
  assert.equal(get(cfg, "jira.projects"), undefined);
  assert.equal(get(cfg, "nope.deep.key"), undefined);
});

test("set writes dotted keys immutably (returns new object, leaves input intact)", () => {
  const cfg = { github: { repos: ["o/r"] } };
  const next = set(cfg, "jira.projects", ["AC"]);
  assert.deepEqual((next.jira as { projects: string[] }).projects, ["AC"]);
  assert.deepEqual((next.github as { repos: string[] }).repos, ["o/r"]); // carried over
  // original untouched
  assert.equal((cfg as { jira?: unknown }).jira, undefined);
  assert.notEqual(next, cfg);
});

test("set on a top-level key works", () => {
  const next = set({}, "db", "/tmp/y.db");
  assert.equal(next.db, "/tmp/y.db");
});

test("mergeFlags precedence: flag > config > default", () => {
  const config = {
    db: "/from/config.db",
    sources: ["github"],
    github: { repos: ["cfg/repo"] },
  };

  // No flags passed (undefined): config wins where present, DEFAULTS elsewhere.
  const fromConfig = mergeFlags(config, {});
  assert.equal(fromConfig.db, "/from/config.db");
  assert.deepEqual(fromConfig.sources, ["github"]);
  assert.deepEqual(fromConfig.repos, ["cfg/repo"]);
  assert.deepEqual(fromConfig.projects, DEFAULTS.jira!.projects); // [] default
  assert.equal(fromConfig.since, DEFAULTS.since); // null default

  // Explicit flags win over config.
  const fromFlags = mergeFlags(config, {
    db: "/from/flag.db",
    repos: ["flag/repo"],
  });
  assert.equal(fromFlags.db, "/from/flag.db");
  assert.deepEqual(fromFlags.repos, ["flag/repo"]);
  assert.deepEqual(fromFlags.sources, ["github"]); // still from config

  // Empty config + no flags → all DEFAULTS.
  const empty = mergeFlags({}, {});
  assert.equal(empty.db, DEFAULTS.db);
  assert.deepEqual(empty.sources, DEFAULTS.sources);
  assert.deepEqual(empty.channels, DEFAULTS.slack!.channels);
});
