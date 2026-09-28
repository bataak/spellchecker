import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { format, parse } from "../src/markdown.ts";
import { TEMPLATES, findTemplate } from "../src/templates.ts";
import { applyTemplate, guillemets } from "../src/office/apply.ts";

const styles = (md: string, id: string): string[] =>
  applyTemplate(parse(md), findTemplate(id)!).blocks.map((b) =>
    b.kind === "para" ? b.style : b.kind,
  );

const texts = (md: string, id: string): string[] =>
  applyTemplate(parse(md), findTemplate(id)!).blocks.map((b) =>
    b.kind === "para" ? b.runs.map((r) => r.text).join("") : "",
  );

test("шулуун хашилтыг монгол хашилт болгоно", () => {
  assert.equal(guillemets('"Хан Хурмаст" ХХК'), "«Хан Хурмаст» ХХК");
  assert.equal(guillemets("хашилтгүй бичвэр"), "хашилтгүй бичвэр");
});

test("захидлын хүрээ эхний гарчгийг нэр болгоно", () => {
  const out = styles(
    "# Танаа өргөдөл гаргах нь:\n\nУрт догол " + "үг ".repeat(40),
    "letter",
  );
  assert.equal(out[0], "Title");
  assert.equal(out[1], "BodyFirst");
});

test("бүтцийн хүрээнд эхний гарчиг нэр болохгүй", () => {
  assert.equal(styles("# Тайлан\n\nДогол.\n", "report")[0], "Heading1");
});

test("хуудасны дугаар: тайлан, бүлэгтэй албан бичигт байна, өргөдөлд байхгүй", () => {
  const pages = (md: string, id: string): boolean | undefined =>
    applyTemplate(parse(md), findTemplate(id)!).pageNumbers;
  assert.equal(pages("# Нэр\n\nДогол.\n", "report"), true);
  assert.equal(pages("# Нэр\n\n## Бүлэг\n\nДогол.\n", "letter"), true);
  assert.equal(pages("# Нэр\n\nДогол.\n", "letter"), false);
  assert.equal(
    pages(readFileSync("src/examples/application.md", "utf8"), "letter"),
    false,
  );
});

test("хүснэгтийн дараа зай авна", () => {
  const out = styles("| a | b |\n| - | - |\n| 1 | 2 |\n\nДогол.\n", "report");
  assert.deepEqual(out, ["table", "TableGap", "Body"]);
});

test("жагсаалт, хүснэгт, ишлэл хадгалагдана", () => {
  const md =
    "# Т\n\n- нэг\n- хоёр\n\n> иш\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const kinds = applyTemplate(parse(md), findTemplate("report")!).blocks.map(
    (b) => b.kind,
  );
  assert.equal(kinds.includes("list"), true);
  assert.equal(kinds.includes("table"), true);
});

test("далд дүрэмгүй: гарчгийн өмнөх догол, «Гарын үсэг», огноо энгийн бие", () => {
  const md =
    "Хүлээн авагч\n\n# Нэр\n\nДогол.\n\n2026/09/28\n\nГарын үсэг\n\nЗахирал: Бат\n";
  assert.deepEqual(styles(md, "letter"), [
    "Body",
    "Title",
    "BodyFirst",
    "Body",
    "Body",
    "Body",
  ]);
  assert.equal(texts(md, "letter").includes("Гарын үсэг"), true);
});

test("div-ийн класс зэрэгцүүлэлтийг тодорхойлно", () => {
  const md =
    "::: {.center}\nТөв\n:::\n\n# Нэр\n\nДогол.\n\n::: {.right}\nБаруун\n:::\n\n" +
    "::: {.left}\nЗүүн\n:::\n\n::: {.signature}\nНэг\n\nХоёр\n:::\n";
  assert.deepEqual(styles(md, "letter"), [
    "Center",
    "Title",
    "BodyFirst",
    "Right",
    "Left",
    "SignatureTop",
    "Signature",
  ]);
});

test("мөр шилжилт догол доторх мөрүүдийг хадгална", () => {
  const md = "# Нэр\n\n::: {.right}\nНэг\\\nХоёр  \nГурав\n:::\n";
  assert.deepEqual(texts(md, "letter").at(-1), "Нэг\nХоёр\nГурав");
});

test("илтгэгчийн тэмдэглэл баримтад орохгүй, YAML гарчиг болно", () => {
  const md =
    "---\ntitle: Судалгаа\nauthor: Бат\n---\n\n# Хэсэг\n\nДогол.\n\n::: notes\nНууц.\n:::\n";
  assert.deepEqual(styles(md, "report"), ["Title", "Center", "Heading1", "BodyFirst"]);
  assert.equal(texts(md, "report").includes("Нууц."), false);
});

test("ишлэл доторх гарчиг албан бичгийн нэр болохгүй", () => {
  const out = styles("# Нэр\n\n> ## Ишлэл\n> Догол.\n", "letter");
  assert.deepEqual(out, ["Title", "Quote", "Quote"]);
});

test("өргөдлийн жишээ: гарын үсгийн хүснэгт баруун тийш, зураас нүдийг дүүргэнэ", () => {
  const md = readFileSync("src/examples/application.md", "utf8");
  const ir = applyTemplate(parse(md), findTemplate("letter")!);
  assert.deepEqual(
    ir.blocks.map((b) => (b.kind === "para" ? b.style : b.kind)),
    ["Title", "BodyFirst", "Body", "SignatureGap", "table", "TableGap"],
  );
  const table = ir.blocks[4];
  assert.ok(table && table.kind === "table");
  assert.equal(table.placement, "end");
  assert.equal(table.cellStyle, "SignCell");
  assert.equal(table.header, false);
  assert.deepEqual(table.rows[1]?.[1], [{ text: "", fill: true }]);
  assert.equal(ir.styles["SignCell"]?.lineHeightPercent, 150);
});

test("жишээ бүр файлтай бөгөөд хэлбэржүүлэхэд хэвээр үлдэнэ", () => {
  for (const template of TEMPLATES)
    for (const example of template.examples ?? []) {
      const md = readFileSync("src/examples/" + example.id + ".md", "utf8");
      assert.ok(md.trim(), example.id);
      assert.equal(format(md), md, example.id);
    }
});

test("параграфыг догол мөргүй, 6pt зайгаар ялгана", () => {
  for (const id of ["letter", "report"]) {
    const ir = applyTemplate(parse("# Нэр\n\nДогол.\n"), findTemplate(id)!);
    assert.equal(ir.styles["BodyFirst"]?.firstLineIndentCm, undefined, id);
    assert.equal(ir.styles["Body"]?.firstLineIndentCm, undefined, id);
    assert.equal(ir.styles["Body"]?.lineHeightPercent, 115, id);
    assert.equal(ir.styles["Body"]?.spaceAfterPt, 6, id);
  }
  const letter = applyTemplate(parse("# Нэр\n"), findTemplate("letter")!);
  assert.equal(letter.styles["SignatureTop"]?.spaceBeforePt, 22);
  assert.equal(letter.styles["SignatureGap"]?.spaceBeforePt, 21);
});

test("#### гарчиг дараагийн доголтой нэг мөрөнд", () => {
  const md = "# Нэр\n\n#### Үндэслэл.\n\nТекст.\n\n#### Зорилт.\n\n- нэг\n";
  const ir = applyTemplate(parse(md), findTemplate("report")!);
  assert.deepEqual(
    ir.blocks.map((b) => (b.kind === "para" ? b.style : b.kind)),
    ["Heading1", "RunIn", "Heading4", "list"],
  );
  const runIn = ir.blocks[1];
  assert.ok(runIn && runIn.kind === "para");
  assert.deepEqual(runIn.runs, [
    { text: "Үндэслэл.", bold: true },
    { text: " " },
    { text: "Текст." },
  ]);
});
