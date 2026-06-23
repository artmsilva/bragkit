import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTicketKeys, autoTag, normalizeTags } from "../src/tagging.ts";
import type { Achievement } from "../src/achievement.ts";

function ach(over: Partial<Achievement> = {}): Achievement {
  return {
    id: "x", source: "github", type: "pr_merged", title: "", description: "",
    url: "", date: "2025-06-01T00:00:00Z", tags: [], metadata: {}, ...over,
  };
}

test("extractTicketKeys finds distinct tracker keys", () => {
  assert.deepEqual(extractTicketKeys("fix: PROJ-1234 and PROJ-1234 plus TEAM-9"), ["PROJ-1234", "TEAM-9"]);
});

test("extractTicketKeys ignores tech/standards lookalikes", () => {
  assert.deepEqual(extractTicketKeys("use UTF-8 and SHA-256 over HTTP-2, fixes CVE-2021"), []);
});

test("autoTag adds ticket keys as tags and as metadata.relatedKeys", () => {
  const a = autoTag(ach({ title: "feat: PROJ-512 expose editor", tags: ["pull-request"] }));
  assert.ok(a.tags.includes("PROJ-512"));
  assert.ok(a.tags.includes("pull-request"));
  assert.deepEqual(a.metadata.relatedKeys, ["PROJ-512"]);
});

test("a PR and its Jira issue share the same ticket tag (dedup hint)", () => {
  const pr = autoTag(ach({ source: "github", title: "fix: PROJ-700 thing" }));
  const issue = autoTag(ach({ source: "jira", title: "PROJ-700: the thing", tags: ["jira", "PROJ"] }));
  assert.ok(pr.tags.includes("PROJ-700"));
  assert.ok(issue.tags.includes("PROJ-700"));
});

test("autoTag returns the same object when nothing changes", () => {
  const a = ach({ title: "no keys here", tags: ["a", "b"] });
  assert.equal(autoTag(a), a);
});

test("normalizeTags trims, drops empties, de-dupes, preserves order", () => {
  assert.deepEqual(normalizeTags([" a ", "b", "a", "", "b", "c"]), ["a", "b", "c"]);
});
