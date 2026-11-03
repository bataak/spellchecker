import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/markdown.ts";
import { escapeCode, escapeProse } from "../src/tex/texescape.ts";
import { toBeamer, toLatex, toLatexBody } from "../src/tex/latex.ts";

const nested = (depth: number, marker: (level: number) => string): string =>
  Array.from(
    { length: depth },
    (_, level) =>
      "  ".repeat(level * 2) + marker(level) + " түвшин" + String(level + 1),
  ).join("\n") + "\n";

const bullets = (depth: number): string => nested(depth, () => "-");
const numbers = (depth: number): string => nested(depth, () => "1.");
const mixed = (depth: number): string =>
  nested(depth, (level) => (level % 2 ? "1." : "-"));

const maxDepth = (tex: string, env: string): number => {
  let open = 0;
  let deepest = 0;
  for (const [tag] of tex.matchAll(
    /\\(?:begin|end)\{(?:itemize|enumerate)\}/g,
  )) {
    if (!tag.includes(env)) continue;
    open += tag.startsWith("\\begin") ? 1 : -1;
    deepest = Math.max(deepest, open);
  }
  return deepest;
};

const allDepth = (tex: string): number => {
  let open = 0;
  let deepest = 0;
  for (const [tag] of tex.matchAll(
    /\\(?:begin|end)\{(?:itemize|enumerate)\}/g,
  )) {
    open += tag.startsWith("\\begin") ? 1 : -1;
    deepest = Math.max(deepest, open);
  }
  return deepest;
};

const items = (tex: string): string[] =>
  [...tex.matchAll(/\\item (түвшин\d+)/g)].map((match) => match[1]!);

const levels = (depth: number): string[] =>
  Array.from({ length: depth }, (_, level) => "түвшин" + String(level + 1));

test("жагсаалт: 4 түвшин хэвээр үүрлэнэ", () => {
  const tex = toLatexBody(parse(bullets(4)));
  assert.equal(maxDepth(tex, "itemize"), 4);
  assert.deepEqual(items(tex), levels(4));
});

test("жагсаалт: 5-аас дээш ижил түвшин агуулгаа алдалгүй хавтгайрна", () => {
  for (const source of [bullets, numbers]) {
    const tex = toLatexBody(parse(source(7)));
    assert.equal(allDepth(tex), 4);
    assert.deepEqual(items(tex), levels(7));
  }
});

test("жагсаалт: холимог үүрлэлт 6 түвшнээс хэтрэхгүй", () => {
  const tex = toLatexBody(parse(mixed(9)));
  assert.equal(allDepth(tex), 6);
  assert.ok(maxDepth(tex, "itemize") <= 4);
  assert.ok(maxDepth(tex, "enumerate") <= 4);
  assert.deepEqual(items(tex), levels(9));
});

test("жагсаалт: хавтгайрсан түвшний дараах ах дүү зүйл байрандаа үлдэнэ", () => {
  const md = bullets(6) + "- дараагийн\n";
  const tex = toLatexBody(parse(md));
  assert.match(
    tex,
    /\\item түвшин6\n(?:\s*\\end\{itemize\}\n)+\s*\\item дараагийн/,
  );
  assert.equal(allDepth(tex), 4);
});

test("жагсаалт: Beamer 3 түвшнээс хэтрэхгүй", () => {
  const tex = toBeamer(parse("# Г\n\n## Х\n\n" + bullets(5)));
  assert.equal(allDepth(tex), 3);
  for (const level of levels(5)) assert.ok(tex.includes(level), level);
});

test("жагсаалт: Beamer-ийн холимог үүрлэлт ч 3 түвшнээс хэтрэхгүй", () => {
  const tex = toBeamer(parse("# Г\n\n## Х\n\n" + mixed(7)));
  assert.equal(allDepth(tex), 3);
  for (const level of levels(7)) assert.ok(tex.includes(level), level);
});

test("жагсаалт: Article 4 түвшин ашиглана", () => {
  assert.equal(allDepth(toLatex(parse(bullets(4)))), 4);
});

test("жагсаалт: эхлэх дугаар гүнд хэвээр", () => {
  const md = "- а\n  3. б\n     5. в\n";
  const tex = toLatexBody(parse(md));
  assert.match(tex, /\\setcounter\{enumi\}\{2\}/);
  assert.match(tex, /\\setcounter\{enumii\}\{4\}/);
});

const quoted = (depth: number, md: string): string =>
  md
    .split("\n")
    .map((line) => "> ".repeat(depth) + line)
    .join("\n") + "\n";

const quotes = (tex: string): number =>
  [...tex.matchAll(/\\begin\{quote\}/g)].length;

test("ишлэл: 5-аас дээш давхарт бичвэр алдагдахгүй", () => {
  const tex = toLatexBody(parse(quoted(8, "гүн бичвэр")));
  assert.equal(quotes(tex), 5);
  assert.equal(quotes(tex), [...tex.matchAll(/\\end\{quote\}/g)].length);
  assert.ok(tex.includes("гүн бичвэр"));
});

test("ишлэл: дотор нь орсон жагсаалт нийт 6 орчноос хэтрэхгүй", () => {
  for (const depth of [1, 2, 3, 4, 5, 8]) {
    const tex = toLatexBody(parse(quoted(depth, mixed(7))));
    assert.equal(quotes(tex) + allDepth(tex), 6, String(depth));
    assert.deepEqual(items(tex), levels(7));
  }
});

test("ишлэл: Beamer-т ишлэл, жагсаалт нийлээд 6 орчноос хэтрэхгүй", () => {
  for (const depth of [1, 3, 4, 5, 8]) {
    const tex = toBeamer(parse("# Г\n\n## Х\n\n" + quoted(depth, mixed(7))));
    assert.ok(allDepth(tex) <= 3);
    assert.ok(quotes(tex) + allDepth(tex) <= 6, String(depth));
    for (const level of levels(7)) assert.ok(tex.includes(level), level);
  }
});

test("escapeCode: кодын лигатурыг бүгдийг таслана", () => {
  assert.equal(escapeCode("--flag"), "-{}-flag");
  assert.equal(escapeCode("---"), "-{}-{}-");
  assert.equal(escapeCode("<< x >>"), "<{}< x >{}>");
  assert.equal(escapeCode(",,z"), ",{},z");
  assert.equal(escapeCode("''"), "'{}'");
  assert.equal(escapeCode("``"), "`{}`");
  assert.equal(escapeCode("?` !`"), "?{}` !{}`");
  assert.equal(escapeCode("a-b <c> ,d"), "a-b <c> ,d");
});

test("escapeProse: хашилтыг бичсэнээр нь үлдээж зураасыг хэвээр орхино", () => {
  assert.equal(escapeProse("<<а>> ,,б"), "<{}<а>{}> ,{},б");
  assert.equal(escapeProse("2020--2021 --- а"), "2020--2021 --- а");
});

test("Markdown: бичвэр ба кодын лигатур", () => {
  const code = toLatexBody(parse("`--flag << x`"));
  assert.ok(code.includes("\\texttt{-{}-flag <{}< x}"), code);
  const prose = toLatexBody(parse("<<а>> 1--2"));
  assert.ok(prose.includes("<{}<а>{}> 1--2"), prose);
});
