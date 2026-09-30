import test from "node:test";
import assert from "node:assert/strict";

import {
  fitBlanks,
  format,
  isMarkdown,
  parse,
  print,
  toHtml,
  todayText,
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

function paragraphOf(src: string): Extract<Block, { type: "paragraph" }> {
  const b = parse(src)[0]!;
  assert.equal(b.type, "paragraph", src);
  return b as Extract<Block, { type: "paragraph" }>;
}

function plainText(src: string): string {
  const p = paragraphOf(src);
  assert.equal(p.children.length, 1, src);
  assert.equal(p.children[0]!.type, "text", src);
  return (p.children[0] as { value: string }).value;
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
  зүүлт: "Ууган охин Нямаа* эмч, дараагийн охин Индра* багш.\n",
  зүүлтТаслал: "Түүхч Б.Д.Цыбыков*, М.П.Хабаев* нар бичжээ.\n",
  доогуурЗураас: "Файлууд mn_MN.aff болон hyph_mn_MN байна.\n",
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

test("хүснэгт — мөрийн нийт урт 100-аас бага бол тэгшитгэнэ", () => {
  const src =
    "|  |  |\n| --- | --- |\n| **Судалгааны хугацаа** | 2026.07.01 – 2026.09.25 (60 ажлын өдөр) |\n| **Нэр** | Утга |\n";
  const lines = format(src).trim().split("\n");
  assert.equal(new Set(lines.map((line) => line.length)).size, 1);
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

test("isMarkdown — тодорхой тэмдэглэгээг таньна", () => {
  const strong = [
    SAMPLES.гарчиг,
    SAMPLES.ишлэл,
    SAMPLES.код,
    SAMPLES.зураас,
    SAMPLES.холбоос,
    SAMPLES.онцлол,
    SAMPLES.inlineCode,
    SAMPLES.хүснэгт,
    SAMPLES.autolink,
  ];
  for (const src of strong) assert.ok(isMarkdown(parse(src!)), src);
});

test("isMarkdown — жагсаалт дангаараа хангалтгүй", () => {
  const plain = [
    "Талибууд Афганистанд хяналтаа тогтоов.\n",
    "- нэг\n- хоёр\n- гурав\n",
    "1. Эхлээд\n2. Дараа нь\n",
    SAMPLES.escape!,
    SAMPLES.бишАвтолинк!,
    SAMPLES.зүүлт!,
    SAMPLES.зүүлтТаслал!,
    SAMPLES.доогуурЗураас!,
  ];
  for (const src of plain) assert.equal(isMarkdown(parse(src)), false, src);
});

test("isMarkdown — мөрийн төгсгөлийн хоёр зай хангалтгүй", () => {
  const plain = [
    "Эцэг эхчүүд ярив.  \nskip-share\n",
    "Эхний мөр\\\nДараагийн мөр\n",
    "- нэг  \n  хоёр\n",
  ];
  for (const src of plain) assert.equal(isMarkdown(parse(src)), false, src);
});

test("isMarkdown — жагсаалтын доторх тэмдэглэгээ тоологдоно", () => {
  assert.ok(isMarkdown(parse("- **нэг**\n- хоёр\n")));
});

test("зүүлтийн од — бүхэлдээ текст хэвээр үлдэнэ", () => {
  assert.equal(
    plainText(SAMPLES.зүүлт!),
    "Ууган охин Нямаа* эмч, дараагийн охин Индра* багш.",
  );
  assert.equal(
    plainText(SAMPLES.зүүлтТаслал!),
    "Түүхч Б.Д.Цыбыков*, М.П.Хабаев* нар бичжээ.",
  );
});

test("үг доторх доогуур зураас онцлол болохгүй", () => {
  assert.equal(
    plainText(SAMPLES.доогуурЗураас!),
    "Файлууд mn_MN.aff болон hyph_mn_MN байна.",
  );
});

test("нээх тэмдэг — зайн өмнө хүчингүй", () => {
  for (const src of [
    "Энэ * зөв биш * бичиглэл.\n",
    "Энэ ** зөв биш ** бичиглэл.\n",
    "Энэ _ зөв биш _ бичиглэл.\n",
    "Энэ ~~ зөв биш ~~ бичиглэл.\n",
  ])
    assert.equal(isMarkdown(parse(src)), false, src);
});

test("нээх тэмдэг — үгэнд наалдсан цэг таслалын өмнө хүчингүй", () => {
  for (const src of [
    "Тэмдэг*, дараагийн* үг.\n",
    "Тэмдэг**, дараагийн** үг.\n",
    "Хуудас13*; дараагийн* мөр.\n",
  ])
    assert.equal(isMarkdown(parse(src)), false, src);
});

test("нээх тэмдэг — зайн дараах хашилтын өмнө хүчинтэй", () => {
  for (const src of [
    "Ном **«Монголын нууц товчоо»** юм.\n",
    "Тэр *(тодруулбал)* ийм.\n",
  ])
    assert.ok(isMarkdown(parse(src)), src);
});

test("онцлол — жинхэнэ тэмдэглэгээ хэвээр ажиллана", () => {
  const cases: [string, string][] = [
    ["Энэ *налуу* үг.\n", "<em>налуу</em>"],
    ["Энэ **тод** үг.\n", "<strong>тод</strong>"],
    ["Энэ ***хосолсон*** үг.\n", "<strong><em>хосолсон</em></strong>"],
    ["Энэ ~~хассан~~ үг.\n", "<del>хассан</del>"],
    ["Энэ _налуу_ үг.\n", "<em>налуу</em>"],
    ["Энэ __тод__ үг.\n", "<strong>тод</strong>"],
    ["Энэ ___хосолсон___ үг.\n", "<strong><em>хосолсон</em></strong>"],
  ];
  for (const [src, want] of cases) {
    const html = toHtml(parse(src));
    assert.ok(html.includes(want), `${src} → ${html}`);
  }
});

test("хаах тэмдгийн өмнөх цэг таслал зөвшөөрөгдөнө", () => {
  const html = toHtml(parse("**Гарчиг:** тайлбар.\n"));
  assert.ok(html.includes("<strong>Гарчиг:</strong>"), html);
});

test("зэргэлдээ онцлолын гүйлт тусдаа задарна", () => {
  const cases: [string, string][] = [
    ["**нэг****хоёр**\n", "<strong>нэг</strong><strong>хоёр</strong>"],
    ["__нэг____хоёр__\n", "<strong>нэг</strong><strong>хоёр</strong>"],
    ["~~а~~~~б~~\n", "<del>а</del><del>б</del>"],
    ["**нэг** **хоёр**\n", "<strong>нэг</strong> <strong>хоёр</strong>"],
  ];
  for (const [src, want] of cases) {
    const html = toHtml(parse(src));
    assert.ok(html.includes(want), `${src} → ${html}`);
  }
});

test("бүтэн зүүлттэй бичвэр markdown болохгүй", () => {
  const src =
    "Дайны дараах сэргэлтийг Бямбын Ринчингүйгээр* төсөөлөх аргагүй.\n\n" +
    "Ууган охин Нямаа* нүдний эмч, дараагийн охин Индра* багш, хүү Барсболд* палентологич.\n\n" +
    "Үзэл суртал хариуцсан Д.Чимэддорж* уг өгүүллийг хэлэлцүүлэхийг тушаажээ.\n\n" +
    "Зөвлөлт Буриадын түүхч Б.Д.Цыбыков*, М.П.Хабаев* нар баримтаар няцаажээ.\n\n" +
    "Ю.Цэдэнбал. 1984 оны наймдугаар сарын 20. Москва хот[i].\n";
  assert.equal(isMarkdown(parse(src)), false);
});

test("томьёо: мөр доторх ба тусдаа", () => {
  assert.deepEqual(parse("Томьёо $x^2 + \\frac{a}{b}$ байна."), [
    {
      type: "paragraph",
      children: [
        { type: "text", value: "Томьёо " },
        { type: "math", open: "$", value: "x^2 + \\frac{a}{b}" },
        { type: "text", value: " байна." },
      ],
      line: 0,
    },
  ]);
  assert.deepEqual(parse("$$\nE = mc^2\n$$"), [
    { type: "math", fence: "$$", value: "E = mc^2", line: 0 },
  ]);
});

test("томьёо: мөнгөн тэмдэгт томьёо болохгүй", () => {
  assert.deepEqual(parse("Үнэ 100$ ба 200$ болно."), [
    {
      type: "paragraph",
      children: [{ type: "text", value: "Үнэ 100$ ба 200$ болно." }],
      line: 0,
    },
  ]);
});

test("томьёо: буцааж бичихэд хэвээр үлдэнэ", () => {
  const src = "Тэгшитгэл $a_1 + b_1$ ба \\$5.\n\n$$\n\\sum_{i=1}^n i\n$$\n";
  assert.equal(format(format(src)), format(src));
  assert.match(format(src), /\$a_1 \+ b_1\$/);
  assert.match(toHtml(parse(src)), /<div class="math math-display"/);
});

test("томьёо: \\[ \\] ба орчин", () => {
  assert.deepEqual(
    parse("Өмнө\n\\[ x^2 \\]\nДараа").map((b) => b.type),
    ["paragraph", "math", "paragraph"],
  );
  const env = "\\begin{align*}\na &= b \\\\\nc &= d\n\\end{align*}";
  assert.deepEqual(parse(env + "\n\nДогол."), [
    { type: "math", fence: "env", value: env, line: 0 },
    {
      type: "paragraph",
      children: [{ type: "text", value: "Догол." }],
      line: 5,
    },
  ]);
  assert.equal(format("\\[\nx\n\\]\n"), "\\[\nx\n\\]\n");
  assert.equal(format(env + "\n"), env + "\n");
});

test("томьёо: хаагдаагүй бол энгийн догол болно", () => {
  assert.deepEqual(
    parse("\\[1\\] ном зүй\n\nДогол.\n\nСүүл \\]").map((b) => b.type),
    ["paragraph", "paragraph", "paragraph"],
  );
  assert.deepEqual(
    parse("$$ хаагдаагүй\n\nДогол.").map((b) => b.type),
    ["paragraph", "paragraph"],
  );
});

test("LaTeX орчин: томьёоны ба бичвэрийн", () => {
  const types = (src: string): string[] =>
    parse(src).map((b) => (b.type === "latex" ? "latex:" + b.env : b.type));
  assert.deepEqual(types("\\begin{pmatrix}\n1 & 2\n\\end{pmatrix}"), ["math"]);
  assert.deepEqual(types("\\begin{cases}\n1 & x\n\\end{cases}"), ["math"]);
  assert.deepEqual(
    types(
      "\\begin{itemize}\n\\item А\n\\begin{itemize}\n\\item Б\n\\end{itemize}\n\\end{itemize}\n\nДогол.",
    ),
    ["latex:itemize", "paragraph"],
  );
  assert.deepEqual(types("\\begin{proof}\nНэг.\n\nХоёр.\n\\end{proof}"), [
    "latex:proof",
  ]);
  assert.deepEqual(
    types("\\begin{verbatim}\n\\begin{itemize}\n\\end{verbatim}\nДогол."),
    ["latex:verbatim", "paragraph"],
  );
  assert.deepEqual(types("\\begin{unknown}\nх\n\\end{unknown}"), ["paragraph"]);
  assert.deepEqual(types("\\begin{theorem}\nхаагдаагүй"), ["paragraph"]);
});

test("LaTeX орчин буцааж бичихэд хэвээр үлдэнэ", () => {
  const src = "\\begin{table}[h]\n\\centering\n\\caption{Х}\n\\end{table}\n";
  assert.equal(format(src), src);
});

test("томьёо: мөр доторх бүх хязгаарлагч", () => {
  const src = "$a$ \\(b\\) \\begin{math}c\\end{math} $$d$$ төгсгөл.";
  const [p] = parse(src);
  assert.ok(p && p.type === "paragraph");
  assert.deepEqual(
    p.children
      .filter((n) => n.type === "math")
      .map((n) => (n.type === "math" ? [n.open, n.value] : [])),
    [
      ["$", "a"],
      ["\\(", "b"],
      ["\\begin{math}", "c"],
      ["$$", "d"],
    ],
  );
  assert.equal(format(src), src + "\n");
  assert.match(toHtml(parse(src)), /<span class="math math-display">d</);
});

test("томьёо: displaymath орчин", () => {
  const env = "\\begin{displaymath}\nE = mc^2\n\\end{displaymath}";
  assert.deepEqual(parse(env), [
    { type: "math", fence: "env", value: env, line: 0 },
  ]);
});

test("томьёо: код доторх хязгаарлагч хэвээр үлдэнэ", () => {
  assert.deepEqual(parse("`\\(x\\)` ба `$y$`")[0], {
    type: "paragraph",
    children: [
      { type: "code", value: "\\(x\\)" },
      { type: "text", value: " ба " },
      { type: "code", value: "$y$" },
    ],
    line: 0,
  });
});

test("томьёо: escape хийсэн $ хэлбэржүүлэхэд томьёо болохгүй", () => {
  const once = format("\\$5 ба 100$ текст.\n");
  assert.equal(format(once), once);
  const [p] = parse(once);
  assert.ok(p && p.type === "paragraph");
  assert.equal(
    p.children.some((n) => n.type === "math"),
    false,
  );
  assert.equal(format("100$ ба 200$ болно.\n"), "100$ ба 200$ болно.\n");
});

test("хэлбэржүүлэхэд шаардлагагүй escape хийхгүй", () => {
  for (const src of [
    "Захирал ____ Б.Бат",
    "snake_case",
    "2*3 = 6",
    "a * b",
    "[1] ном",
    "100$ ба 200$",
    "a < b > c",
  ])
    assert.equal(format(src), src + "\n");
});

test("утга өөрчлөгдөх тохиолдолд escape хэвээр хийнэ", () => {
  const cases = [
    "\\*тод биш\\*",
    "\\_налуу биш\\_",
    "\\[a\\](b)",
    "\\<https://a.mn\\>",
  ];
  for (const src of cases) {
    const out = format(src);
    assert.equal(
      JSON.stringify(
        parse(out).map((b) => b.type === "paragraph" && b.children),
      ),
      JSON.stringify(
        parse(src).map((b) => b.type === "paragraph" && b.children),
      ),
    );
  }
  const line = format("\\_\\_\\_\\_\n");
  assert.deepEqual(
    parse(line).map((b) => b.type),
    ["paragraph"],
  );
});

test("escape хийсэн тэмдэгт цэг таслал гэж тоологдоно", () => {
  const [p] = parse("\\$~~(а|~~");
  const [q] = parse("$~~(а|~~");
  assert.ok(p && p.type === "paragraph" && q && q.type === "paragraph");
  assert.deepEqual(p.children, [
    { type: "text", value: "$" },
    { type: "del", children: [{ type: "text", value: "(а|" }] },
  ]);
  assert.deepEqual(p.children, q.children);
  assert.equal(format("\\\\(а\\\\)"), "\\\\(а\\\\)\n");
});

test("хоосон томьёо буцааж бичихэд хэвээр үлдэнэ", () => {
  assert.equal(format("$$\n$$\n"), "$$$$\n");
  assert.deepEqual(
    parse("$$$$").map((b) => b.type),
    ["math"],
  );
});

test("мөр доторх 3+ доогуур зураас бөглөх зураас болно", () => {
  const [p] = parse("Захирал __________ Б.Бат");
  assert.ok(p && p.type === "paragraph");
  assert.deepEqual(p.children, [
    { type: "text", value: "Захирал " },
    { type: "blank", width: 10 },
    { type: "text", value: " Б.Бат" },
  ]);
  for (const src of [
    "snake___case",
    "__ хоёр",
    "`код ____`",
    "\\_\\_\\_ текст",
  ]) {
    const [q] = parse(src);
    assert.ok(q && q.type === "paragraph");
    assert.equal(
      q.children.some((n) => n.type === "blank"),
      false,
      src,
    );
  }
  assert.equal(format("Огноо:______\n"), "Огноо:______\n");
  assert.match(
    toHtml(parse("Нэр ______")),
    /<span class="blank" style="--blank:6"><\/span>/,
  );
  assert.equal(isMarkdown(parse("Нэр ______")), false);
});

test("____ гарын үсгийн зураас нэрийн урттай тэнцэнэ", () => {
  const widths = (md: string): number[] => {
    const found: number[] = [];
    const walk = (blocks: Block[]): void => {
      for (const block of blocks) {
        if (block.type === "paragraph")
          for (const node of block.children)
            if (node.type === "blank") found.push(node.fit ?? node.width);
        if (block.type === "div") walk(block.children);
      }
    };
    walk(fitBlanks(parse(md)));
    return found;
  };
  assert.deepEqual(
    widths(
      "::: {.signature}\nӨргөдөл гаргасан: С. Боролдой\\\nГарын үсэг: ____\\\nУтас: 99\n:::\n",
    ),
    [11],
  );
  assert.deepEqual(
    widths("::: {.right}\nГаргасан: Б. Бат\n\nГарын үсэг: ____\n:::\n"),
    [6],
  );
  assert.deepEqual(widths("Гарын үсэг: _____\\\nНэр: Урт урт нэр\n"), [5]);
  assert.deepEqual(widths("Ганцаараа ____\n"), [4]);
  assert.equal(
    format("Гарын үсэг: ____\\\nНэр: Бат\n"),
    "Гарын үсэг: ____\\\nНэр: Бат\n",
  );
});

test("TeX лого: preview-д лого, \\LaTeXa гэх мэт бусад командыг хөндөхгүй", () => {
  const html = toHtml(parse("\\LaTeX ба \\LaTeXa"));
  assert.ok(
    html.includes('<span class="tex-logo">L<span class="tex-a">A</span>'),
    html,
  );
  assert.ok(html.includes("\\LaTeXa"), html);
});

test("parse: гарчиг `\\` -аар төгсвөл дараагийн мөрөнд үргэлжилнэ", () => {
  const blocks = parse("# Тэнхимд\\\nӨргөдөл гаргах нь:\n\nБие");
  assert.equal(blocks.length, 2);
  const h = blocks[0] as Extract<Block, { type: "heading" }>;
  assert.equal(h.type, "heading");
  assert.equal(h.line, 0);
  assert.deepEqual(stripLines(h.children), [
    { type: "text", value: "Тэнхимд" },
    { type: "break" },
    { type: "text", value: "Өргөдөл гаргах нь:" },
  ]);
  assert.equal(blocks[1]!.line, 3);
  assert.match(toHtml(blocks), /<h1[^>]*>Тэнхимд<br>Өргөдөл гаргах нь:<\/h1>/);
  assert.equal(print(blocks), "# Тэнхимд \\ Өргөдөл гаргах нь:\n\nБие\n");
});

test("parse: гарчгийн үргэлжлэл шинэ блок эсвэл хоосон мөрийг залгихгүй", () => {
  assert.equal(parse("# А\\\n\nБ")[0]!.type, "heading");
  assert.equal(parse("# А\\\n\nБ").length, 2);
  assert.equal(parse("# А\\\n## Б").length, 2);
  assert.equal(parse("# А\\\\\nБ").length, 2);
  const attrs = parse("# А\\\nБ {.unnumbered}")[0] as Extract<
    Block,
    { type: "heading" }
  >;
  assert.equal(attrs.attrs, "{.unnumbered}");
});

test("parse: гарчиг доторх дан `\\` мөр таслана", () => {
  const blocks = parse("# Тэнхимд \\ Өргөдөл гаргах нь:");
  const h = blocks[0] as Extract<Block, { type: "heading" }>;
  assert.deepEqual(stripLines(h.children), [
    { type: "text", value: "Тэнхимд" },
    { type: "break" },
    { type: "text", value: "Өргөдөл гаргах нь:" },
  ]);
  assert.equal(print(blocks), "# Тэнхимд \\ Өргөдөл гаргах нь:\n");
  assert.deepEqual(stripLines(parse("# А\\ Б")), stripLines(parse("# А \\ Б")));
  const literal = parse("# `a \\ b` \\\\ в $x \\ y$")[0] as Extract<
    Block,
    { type: "heading" }
  >;
  assert.equal(
    literal.children.some((n) => n.type === "break"),
    false,
  );
  const para = parse("А \\ Б")[0] as Extract<Block, { type: "paragraph" }>;
  assert.equal(
    para.children.some((n) => n.type === "break"),
    false,
  );
});

test("parse: гарчгийн `\\` зайгүй ч таслана, төгсгөлийнх хасагдана", () => {
  const expected = stripLines(parse("# А \\ Б"));
  assert.deepEqual(stripLines(parse("# А\\Б")), expected);
  assert.deepEqual(stripLines(parse("# А\u00a0\\ Б")), expected);
  assert.deepEqual(stripLines(parse("# А \\")), stripLines(parse("# А")));
  const logo = parse("# Тэнхим \\LaTeX")[0] as Extract<
    Block,
    { type: "heading" }
  >;
  assert.equal(
    logo.children.some((n) => n.type === "break"),
    false,
  );
});

test("\\today нь өнөөдрийн огноо болж, \\todayx-ийг хөндөхгүй", () => {
  assert.equal(
    toHtml(parse("Огноо: \\today, \\today{} \\todayx")),
    '<p data-line="0">Огноо: ' +
      todayText() +
      ", " +
      todayText() +
      " \\todayx</p>",
  );
  assert.equal(todayText(new Date(2026, 0, 5)), "2026/01/05");
  assert.equal(format("Огноо: \\today\n"), "Огноо: \\today\n");
});
