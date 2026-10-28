import { test } from "node:test";
import assert from "node:assert/strict";
import { format, parse, toHtml } from "../src/markdown.ts";

test("toHtml: width хувьтай хашилт хүснэгтийн өргөнийг CSS хувьсагчаар дамжуулна", () => {
  const html = toHtml(
    parse('::: {width="100%"}\n| А | Б |\n| - | - |\n| 1 | 2 |\n:::'),
  );
  assert.match(html, /data-style="flex-basis:100%;--table-width:100%"/);
});

test("хүснэгт — агуулгаас урт зураасыг хадгалж, нүдийг тэр уртаар дүүргэнэ", () => {
  const src = "| № | Нэр |\n| ---------- | --- |\n| 1 | А |\n";
  const out = format(src);
  const [head, divider] = out.trim().split("\n");
  assert.equal(divider, "| ---------- | --- |");
  assert.equal(head, "| №          | Нэр |");
  const long = "а".repeat(120);
  const wide = format(`| A | B |\n| ------------ | - |\n| ${long} | б |\n`);
  assert.match(wide.split("\n")[1]!, /^\| -{12} \| -{3} \|$/);
});

test("toHtml: width хашилт доторх хүснэгт зураасны харьцаагаар colgroup авна", () => {
  const html = toHtml(
    parse('::: {width="100%"}\n| А | Б |\n| --- | --------- |\n| 1 | 2 |\n:::'),
  );
  assert.match(html, /<table data-style="table-layout:fixed"/);
  assert.match(
    html,
    /<col data-style="width:25%"><col data-style="width:75%">/,
  );
  assert.doesNotMatch(
    toHtml(parse("| А | Б |\n| - | - |\n| 1 | 2 |")),
    /colgroup/,
  );
});
