import test from "node:test";
import assert from "node:assert/strict";

import {
  format,
  isMarkdown,
  parse,
  print,
  toHtml,
  type Block,
} from "../src/markdown.ts";

function stripLines(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLines);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "line") continue;
      out[k] = stripLines(v);
    }
    return out;
  }
  return value;
}

const SAMPLES: Record<string, string> = {
  гарчиг: "# Гарчиг\n\nЭнгийн догол мөр.\n",
  жагсаалт: "- нэг\n- хоёр\n- гурав\n",
  дугаарлалт: "1. нэг\n2. хоёр\n",
  ишлэл: "> Ишлэл эхний мөр\n> үргэлжлэл\n",
  код: "```ts\nconst a = 1;\n```\n",
  зураас: "---\n",
  холбоос: "[Толь](https://zuv.bichig.dev/book/) уруу оръё.\n",
  онцлол: "Энэ **тод** ба *налуу* бичиглэл.\n",
  inlineCode: "Утга нь `--editor-per` байна.\n",
  хүснэгт: "| Нэр | Утга |\n| :--- | ---: |\n| нэг | 1 |\n| хоёр | 2 |\n",
  escape: "Огноо 20XX \\- одоо, no\\_reply@example.mn\n",
  autolink: "Хаяг <https://aldaa.bichig.dev> болон <bat@example.mn>.\n",
  бишАвтолинк: "Тэнцэтгэл а < б бол зөв.\n",
};

for (const [name, src] of Object.entries(SAMPLES)) {
  test(`round-trip — ${name}`, () => {
    assert.deepEqual(
      stripLines(parse(format(src))),
      stripLines(parse(src)),
      format(src),
    );
  });

  test(`идемпотент — ${name}`, () => {
    const once = format(src);
    assert.equal(format(once), once);
  });
}

test("параграф — олон мөрийг нэгтгэнэ", () => {
  const blocks = parse("нэгдүгээр мөр\nхоёрдугаар мөр\n\nдараагийн догол\n");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.type, "paragraph");
});

test("мөрийн дугаар — эх байрлалыг хадгална", () => {
  const blocks = parse("# А\n\nдогол\n\n- жагсаалт\n");
  assert.deepEqual(
    blocks.map((b) => b.line),
    [0, 2, 4],
  );
});

test("гарчгийн гүн", () => {
  const blocks = parse("### Гурав\n");
  const h = blocks[0] as Extract<Block, { type: "heading" }>;
  assert.equal(h.type, "heading");
  assert.equal(h.depth, 3);
});

test("хүснэгт — зэрэгцүүлэлт хадгалагдана", () => {
  const t = parse(SAMPLES.хүснэгт!)[0] as Extract<Block, { type: "table" }>;
  assert.equal(t.type, "table");
  assert.deepEqual(t.align, ["left", "right"]);
  assert.equal(t.rows.length, 3);
});

test("хүснэгт — жижиг үед багана тэгшитгэнэ", () => {
  const out = format(SAMPLES.хүснэгт!);
  const widths = out
    .trim()
    .split("\n")
    .map((l) => l.length);
  assert.equal(new Set(widths).size, 1, out);
});

test("хүснэгт — урт нүдтэй үед тэгшитгэхгүй", () => {
  const long = "а".repeat(120);
  const src = `| Нэр | Утга |\n| :--- | :--- |\n| ${long} | б |\n`;
  const out = format(src);
  const lines = out.trim().split("\n");
  assert.ok(lines[0]!.length < 30, lines[0]);
  assert.ok(lines[1]!.length < 30, lines[1]);
  assert.deepEqual(stripLines(parse(out)), stripLines(parse(src)));
  assert.equal(format(out), out);
});

test("escape — задлалтад алга болохгүй", () => {
  const p = parse(SAMPLES.escape!)[0] as Extract<Block, { type: "paragraph" }>;
  const text = p.children.map((n) => ("value" in n ? n.value : "")).join("");
  assert.ok(text.includes("20XX - одоо"), text);
  assert.ok(text.includes("no_reply@example.mn"), text);
});

test("код блок — доторх ` тэмдэгтээс урт хашилт сонгоно", () => {
  const src = "````\nа ``` б\n````\n";
  assert.deepEqual(stripLines(parse(format(src))), stripLines(parse(src)));
});

test("хоосон мөрөөр эхэлсэн баримт — утга хадгалагдана", () => {
  const src = "\n| Нэр | Утга |\n| :--- | :--- |\n| а | б |\n";
  assert.deepEqual(stripLines(parse(format(src))), stripLines(parse(src)));
  assert.equal(parse(src)[0]!.line, 1);
  assert.equal(parse(format(src))[0]!.line, 0);
});

test("toHtml — data-line тавина", () => {
  const html = toHtml(parse("# А\n\nдогол\n"));
  assert.ok(html.includes('<h1 data-line="0">'), html);
  assert.ok(html.includes('<p data-line="2">'), html);
});

test("toHtml — HTML тэмдэгтийг хамгаална", () => {
  const html = toHtml(parse("<script>alert(1)</script>\n"));
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"), html);
});

test("autolink — өнцөгт хаалт хадгалагдана", () => {
  const out = format("Хаяг <https://aldaa.bichig.dev> байна.\n");
  assert.ok(out.includes("<https://aldaa.bichig.dev>"), out);
  assert.ok(!out.includes("\\<"), out);
});

test("энгийн `<` тэмдэг escape болохгүй", () => {
  const out = format("Тэнцэтгэл а < б бол зөв.\n");
  assert.ok(!out.includes("\\<"), out);
});

test("догол мөрийн эхний `>` хамгаалагдана", () => {
  const blocks = parse("Энгийн мөр\n");
  const forced: Block[] = [
    {
      type: "paragraph",
      children: [{ type: "text", value: "> биш" }],
      line: 0,
    },
  ];
  assert.equal(print(forced).trim(), "\\> биш");
  assert.equal(parse(print(forced))[0]!.type, "paragraph");
  assert.equal(blocks.length, 1);
});

test("print — хоосон модонд хоосон мөр буцаана", () => {
  assert.equal(print([]), "");
});

test("isMarkdown — энгийн бичвэрийг markdown гэж үзэхгүй", () => {
  const plain =
    "Талибууд Афганистанд хяналтаа тогтоосны таван жилийн ой тохиож байна.\n\n" +
    "Хоёр дахь догол мөр. Энд ямар ч тэмдэглэгээ алга.\n";
  assert.equal(isMarkdown(parse(plain)), false);
});

test("хэлбэржүүлсэн баримт дээр өөрчлөх зүйл үлдэхгүй", () => {
  for (const [name, src] of Object.entries(SAMPLES)) {
    const tidy = format(src);
    assert.equal(print(parse(tidy)), tidy, name);
  }
});

test("цэгцгүй бичвэр дээр өөрчлөлт гарна", () => {
  const messy = "#   Гарчиг\n\n\n\n*  нэг\n*  хоёр\n";
  assert.notEqual(print(parse(messy)), messy);
});

test("isMarkdown — тэмдэглэгээтэй бичвэрийг таньна", () => {
  const plain = new Set([SAMPLES.escape, SAMPLES.бишАвтолинк]);
  for (const src of Object.values(SAMPLES)) {
    if (plain.has(src)) continue;
    assert.ok(isMarkdown(parse(src)), src);
  }
});
