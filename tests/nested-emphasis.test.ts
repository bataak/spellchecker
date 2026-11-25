import test from "node:test";
import assert from "node:assert/strict";

import { parse, toHtml } from "../src/markdown.ts";

test("налуу доторх тод, тод доторх налуу задарна (#369)", () => {
  const cases: [string, string][] = [
    [
      "*Энэ **налуу** форматын алдааг шалгаж байна.*\n",
      "<em>Энэ <strong>налуу</strong> форматын алдааг шалгаж байна.</em>",
    ],
    ["**тод *налуу***\n", "<strong>тод <em>налуу</em></strong>"],
    ["*налуу **тод***\n", "<em>налуу <strong>тод</strong></em>"],
    ["***тод** налуу*\n", "<em><strong>тод</strong> налуу</em>"],
    ["***налуу* тод**\n", "<strong><em>налуу</em> тод</strong>"],
  ];
  for (const [src, want] of cases) {
    const html = toHtml(parse(src));
    assert.ok(html.includes(want), `${src} → ${html}`);
  }
});
