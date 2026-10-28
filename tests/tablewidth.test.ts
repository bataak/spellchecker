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

test("\\newpage өмнө нь хоосон мөргүй ч хуудас таслана", () => {
  const kinds = (md: string): string[] => parse(md).map((b) => b.type);
  assert.deepEqual(kinds("Огноо: 2026\n\\newpage\nДараагийн"), [
    "paragraph",
    "pagebreak",
    "paragraph",
  ]);
  assert.deepEqual(kinds("# Гарчиг\n\\newpage"), ["heading", "pagebreak"]);
  assert.deepEqual(kinds("Мөр \\newpage дотор"), ["paragraph"]);
});

test("toHtml: width хувийг экспорттой адил 100%-д хязгаарлаж, 0%-ийг үл тооно", () => {
  const html = (width: string) =>
    toHtml(parse(`::: {width="${width}"}\n| А |\n| - |\n| 1 |\n:::`));
  assert.match(html("150%"), /--table-width:100%/);
  assert.match(html("62.5%"), /--table-width:62.5%/);
  assert.doesNotMatch(html("0%"), /--table-width/);
  assert.match(
    toHtml(parse('::: {.column width="40%"}\nТекст\n:::')),
    /flex-basis:40%/,
  );
});

test("Хэлбэржүүлэх: width хашилт доторх зураасыг харьцаагаар нь уртасгана", () => {
  const out = format(
    '::: {width="100%"}\n| a | b |\n| --- | --------- |\n| long content here xx | y |\n:::\n',
  );
  const divider = out.split("\n")[2]!;
  const bars = divider
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().length);
  assert.equal(bars[1]! / bars[0]!, 3);
  const plain = format(
    "| a | b |\n| --- | --------- |\n| long content here xx | y |\n",
  );
  assert.match(plain.split("\n")[1]!, /^\| -{20} \| -{9} \|$/);
});
