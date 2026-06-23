import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, htmlToText, basicAuthHeader } from "../src/atlassian.ts";

test("adfToText flattens a document with headings, paragraphs, and lists", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", content: [{ type: "text", text: "Goals" }] },
      { type: "paragraph", content: [{ type: "text", text: "Ship the thing." }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
        ],
      },
    ],
  };
  const text = adfToText(doc);
  assert.match(text, /## Goals/);
  assert.match(text, /Ship the thing\./);
  assert.match(text, /• one/);
  assert.match(text, /• two/);
});

test("adfToText is safe on empty / unknown nodes", () => {
  assert.equal(adfToText(null), "");
  assert.equal(adfToText({ type: "mystery" }), "");
  assert.equal(adfToText("plain"), "plain");
});

test("htmlToText strips tags, scripts, and entities", () => {
  const html = `<h1>Title</h1><script>evil()</script><p>Hello&nbsp;&amp; welcome &lt;friend&gt;</p>`;
  const text = htmlToText(html);
  assert.equal(text, "Title Hello & welcome <friend>");
  assert.doesNotMatch(text, /evil/);
});

test("basicAuthHeader base64-encodes email:token", () => {
  assert.equal(basicAuthHeader("a@b.com", "tok"), `Basic ${Buffer.from("a@b.com:tok").toString("base64")}`);
});
