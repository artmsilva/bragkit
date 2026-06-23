import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/reports/csv.ts";
import type { Achievement } from "../src/achievement.ts";

const HEADER = "id,source,type,title,date,url,tags";

const DATA: Achievement[] = [
  {
    id: "github:pr_merged:1",
    source: "github",
    type: "pr_merged",
    title: "Add CSV export",
    date: "2025-06-02T00:00:00.000Z",
    url: "https://x/1",
    tags: ["pull-request", "owner/repo"],
  },
  {
    id: "github:pr_merged:2",
    source: "github",
    type: "pr_merged",
    title: 'Fix "quoted", comma',
    date: "2025-06-01T00:00:00.000Z",
    url: "https://x/2",
    tags: ["bug"],
  },
] as unknown as Achievement[];

test("emits the fixed header row first", () => {
  const csv = toCsv(DATA);
  const firstLine = csv.split("\r\n")[0];
  assert.equal(firstLine, HEADER);
});

test("one row per achievement plus the header", () => {
  const csv = toCsv(DATA);
  // CRLF-terminated rows leave a trailing empty segment after the final \r\n.
  const lines = csv.split("\r\n").filter((l) => l !== "");
  assert.equal(lines.length, DATA.length + 1);
});

test("header only when there are no achievements", () => {
  assert.equal(toCsv([]), HEADER + "\r\n");
});

test("joins tags with semicolons inside one field", () => {
  const csv = toCsv(DATA);
  assert.match(csv, /pull-request;owner\/repo/);
});

test("escapes commas by wrapping the field in double quotes", () => {
  const csv = toCsv([
    { id: "a", source: "s", type: "t", title: "one, two", date: "d", url: "", tags: [] },
  ] as unknown as Achievement[]);
  assert.match(csv, /"one, two"/);
});

test("escapes double quotes by doubling them and wrapping", () => {
  const csv = toCsv([
    { id: "a", source: "s", type: "t", title: 'say "hi"', date: "d", url: "", tags: [] },
  ] as unknown as Achievement[]);
  assert.match(csv, /"say ""hi"""/);
});

test("escapes embedded newlines by quoting the field", () => {
  const csv = toCsv([
    { id: "a", source: "s", type: "t", title: "line1\nline2", date: "d", url: "", tags: [] },
  ] as unknown as Achievement[]);
  assert.match(csv, /"line1\nline2"/);
});

test("is deterministic for the same input", () => {
  assert.equal(toCsv(DATA), toCsv(DATA));
});

test("missing fields render as empty cells, not 'undefined'", () => {
  const csv = toCsv([{ id: "a", source: "s", type: "t", title: "x", date: "d" }] as unknown as Achievement[]);
  const dataRow = csv.split("\r\n")[1];
  // url and tags absent -> trailing empties
  assert.equal(dataRow, "a,s,t,x,d,,");
  assert.doesNotMatch(csv, /undefined/);
});
