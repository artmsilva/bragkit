/**
 * Published-package smoke test. Verifies that what `npm publish` would ship
 * actually works once installed: packs a tarball, installs it into a throwaway
 * project, and runs the installed `brag` bin. Catches packaging mistakes the
 * in-repo tests can't — a wrong `files` list, a bad `bin` path, or `.ts` not
 * executing post-install.
 *
 * Run: node scripts/pack-smoke.ts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

function run(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
}

function fail(msg: string, detail = ""): never {
  console.error(`✗ pack-smoke: ${msg}`);
  if (detail) console.error(detail.slice(0, 800));
  process.exit(1);
}

// 1) Pack the tarball into a temp dir.
const work = mkdtempSync(join(tmpdir(), `bragkit-pack-${process.pid}-`));
try {
  const packed = run("npm", ["pack", "--json", "--pack-destination", work], repo);
  if (packed.code !== 0) fail("npm pack failed", packed.out);
  let tarball: string;
  try {
    tarball = join(work, JSON.parse(packed.out.slice(packed.out.indexOf("[")))[0].filename);
  } catch {
    // Fallback: the only .tgz in the work dir.
    const tgz = readdirSync(work).find((f) => f.endsWith(".tgz"));
    if (!tgz) fail("could not locate packed tarball", packed.out);
    tarball = join(work, tgz!);
  }

  // 2) Install it into a clean throwaway project.
  const proj = mkdtempSync(join(tmpdir(), `bragkit-consumer-${process.pid}-`));
  run("npm", ["init", "-y"], proj);
  const install = run("npm", ["install", "--no-audit", "--no-fund", tarball], proj);
  if (install.code !== 0) fail("npm install of the tarball failed", install.out);

  // 3) Run the installed bin (resolves node_modules/.bin/brag → bin/brag.ts).
  const help = run(join(proj, "node_modules", ".bin", "brag"), ["help"], proj);
  if (help.code !== 0) fail("installed `brag help` exited non-zero", help.out);
  if (!/bragkit/.test(help.out)) fail("`brag help` output missing expected text", help.out);

  // 4) A command that touches node:sqlite, against a temp DB in the project.
  const db = join(proj, "smoke.db");
  const list = run(join(proj, "node_modules", ".bin", "brag"), ["list", "--db", db], proj);
  if (list.code !== 0) fail("installed `brag list` exited non-zero", list.out);

  rmSync(proj, { recursive: true, force: true });
  unlinkSync(tarball);
  console.log("pack-smoke OK — packaged bin installs and runs");
} finally {
  rmSync(work, { recursive: true, force: true });
}
