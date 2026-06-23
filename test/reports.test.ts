import { test } from "node:test";
import assert from "node:assert/strict";
import { render, templates } from "../src/reports/markdown.ts";
import type { Achievement } from "../src/achievement.ts";
import type { Period } from "../src/dates.ts";

const PERIOD: Period = { since: "2025-01-01T00:00:00Z", until: "2025-12-31T23:59:59Z" };
const DATA: Achievement[] = [
  { id: "a", source: "github", type: "pr_merged", title: "Newer PR", url: "https://x/2", date: "2025-06-02T00:00:00Z", tags: ["pull-request", "owner/repo"], metadata: { repository: "owner/repo" } },
  { id: "b", source: "github", type: "pr_merged", title: "Older PR", url: "https://x/1", date: "2025-06-01T00:00:00Z", tags: ["pull-request", "owner/other"], metadata: { repository: "owner/other" } },
] as unknown as Achievement[];

test("every advertised template renders without throwing", () => {
  for (const t of templates()) {
    const md = render(t, DATA, PERIOD);
    assert.match(md, /^# /, `${t} should start with an H1`);
    assert.match(md, /Achievements:\*\* 2/, `${t} should report the count`);
  }
});

test("timeline links titles and groups by date", () => {
  const md = render("timeline", DATA, PERIOD);
  assert.match(md, /\[Newer PR\]\(https:\/\/x\/2\)/);
  assert.match(md, /## Jun 2, 2025/);
});

test("by-project groups under repository and sorts by volume", () => {
  const md = render("by-project", DATA, PERIOD);
  assert.match(md, /## owner\/repo/);
  assert.match(md, /## owner\/other/);
});

test("executive-summary tallies by source and type", () => {
  const md = render("executive-summary", DATA, PERIOD);
  assert.match(md, /\*\*github\*\*: 2/);
  assert.match(md, /\*\*pr_merged\*\*: 2/);
});

test("render rejects an unknown template", () => {
  assert.throws(() => render("nope", DATA, PERIOD), /Unknown template/);
});
