// Zero-dependency smoke test: exercises the Store API and the CLI end-to-end
// against a throwaway SQLite DB. Run with `node scripts/smoke.ts`.
import { Store } from "../src/store.ts";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = join(root, "bin", "brag.ts");
// PID-varied name avoids collisions between concurrent runs.
const db = join(tmpdir(), `bragkit-smoke-${process.pid}.db`);

function fail(msg: string): never {
  console.error(`smoke FAILED: ${msg}`);
  cleanup();
  process.exit(1);
}

function cleanup(): void {
  try {
    rmSync(db, { force: true });
  } catch {
    /* best-effort */
  }
}

function run(args: string[]): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

try {
  // Seed two sample achievements via the library API.
  const store = new Store(db);
  store.upsert({
    id: "github:pr_merged:1",
    source: "github",
    type: "pr_merged",
    title: "Add smoke test harness",
    date: "2025-03-04T12:00:00.000Z",
  });
  store.upsert({
    id: "jira:issue_resolved:PROJ-1",
    source: "jira",
    type: "issue_resolved",
    title: "Resolve flaky pipeline",
    date: "2025-07-21T09:30:00.000Z",
  });
  store.close();

  // `list` should exit 0 and surface a seeded title.
  const list = run(["list", "--db", db]);
  if (list.code !== 0) fail(`list exited ${list.code}\n${list.out}`);
  if (!list.out.includes("Add smoke test harness")) {
    fail(`list output missing expected title:\n${list.out}`);
  }

  // `report 2025` (default timeline template) should exit 0 with the header.
  const report = run(["report", "2025", "--db", db]);
  if (report.code !== 0) fail(`report exited ${report.code}\n${report.out}`);
  if (!report.out.includes("# Achievement Timeline")) {
    fail(`report output missing expected header:\n${report.out}`);
  }

  cleanup();
  console.log("smoke OK");
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err));
}
