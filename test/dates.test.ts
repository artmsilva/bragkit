import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parsePeriod } from "../src/dates.ts";

const NOW = new Date("2026-06-23T00:00:00Z");

test("parseDate handles ISO, relative, and today", () => {
  assert.equal(parseDate("2025-06-01").toISOString().slice(0, 10), "2025-06-01");
  assert.equal(parseDate("30 days ago", { now: NOW }).toISOString().slice(0, 10), "2026-05-24");
  assert.equal(parseDate("today", { now: NOW }).toISOString().slice(0, 10), "2026-06-23");
});

test("parseDate throws on garbage", () => {
  assert.throws(() => parseDate("whenever"), /Unrecognized date/);
});

test("parsePeriod resolves a year", () => {
  const { since, until } = parsePeriod("2025");
  assert.equal(since.slice(0, 10), "2025-01-01");
  assert.equal(until.slice(0, 10), "2025-12-31");
});

test("parsePeriod resolves a quarter", () => {
  const { since, until } = parsePeriod("Q2 2025");
  assert.equal(since.slice(0, 10), "2025-04-01");
  assert.equal(until.slice(0, 10), "2025-06-30");
});

test("parsePeriod resolves an explicit range", () => {
  const { since, until } = parsePeriod("2025-01-15 to 2025-03-20");
  assert.equal(since.slice(0, 10), "2025-01-15");
  assert.equal(until.slice(0, 10), "2025-03-20");
});
