import { test } from "node:test";
import assert from "node:assert/strict";
import { countReactions, topReactions, cleanSlackText, extractTitle, isLikelyKudos } from "../src/collectors/slack.ts";

const ME = "U123";

test("countReactions sums reaction counts", () => {
  assert.equal(countReactions({ reactions: [{ name: "fire", count: 3 }, { name: "tada", count: 2 }] }), 5);
  assert.equal(countReactions({}), 0);
});

test("topReactions returns the most-used emoji, formatted", () => {
  const msg = { reactions: [{ name: "a", count: 1 }, { name: "b", count: 5 }, { name: "c", count: 3 }] };
  assert.deepEqual(topReactions(msg, 2), [":b:", ":c:"]);
});

test("cleanSlackText resolves mentions, links, and entities", () => {
  const raw = "<@U999> see <#C1|general> and <https://x.com|the docs> &amp; more";
  assert.equal(cleanSlackText(raw), "@user see #general and the docs & more");
});

test("extractTitle uses the first line, strips formatting, truncates", () => {
  assert.equal(extractTitle("*Big news*\nsecond line"), "Big news");
  assert.equal(extractTitle(""), "Slack message");
  assert.equal(extractTitle("x".repeat(120)).length, 100);
});

test("isLikelyKudos requires both a mention of the user and positive sentiment", () => {
  assert.equal(isLikelyKudos(`thanks <@${ME}> for the help!`, ME), true);
  assert.equal(isLikelyKudos(`<@${ME}> can you review this?`, ME), false, "mention without praise is not kudos");
  assert.equal(isLikelyKudos(`great work everyone`, ME), false, "praise without mention is not kudos");
  assert.equal(isLikelyKudos(`:tada: <@${ME}>`, ME), true, "emoji praise counts");
});
