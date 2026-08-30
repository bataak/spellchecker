import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/templates.ts";
import { applyTemplate, guillemets, mongolianDate } from "../src/office/apply.ts";

const AT = new Date("2026-08-20T12:00:00Z");

const styles = (md: string, id: string): string[] =>
  applyTemplate(parse(md), findTemplate(id)!, { now: AT }).blocks.map((b) =>
    b.kind === "para" ? b.style : b.kind,
  );

test("огноог монголоор бичнэ", () => {
  assert.equal(mongolianDate(new Date("2026-08-20T12:00:00Z")),
    "2026 оны 08 дугаар сарын 20-ны өдөр");
  assert.equal(mongolianDate(new Date("2026-09-01T12:00:00Z")),
    "2026 оны 09 дүгээр сарын 01-ний өдөр");
  assert.equal(mongolianDate(new Date("2026-05-10T12:00:00Z")),
    "2026 оны 05 дугаар сарын 10-ны өдөр");
});

test("шулуун хашилтыг монгол хашилт болгоно", () => {
  assert.equal(guillemets('"Хан Хурмаст" ХХК'), "«Хан Хурмаст» ХХК");
  assert.equal(guillemets("хашилтгүй бичвэр"), "хашилтгүй бичвэр");
});

test("захидлын хүрээ эхний гарчгийг нэр болгоно", () => {
  const out = styles("# Танаа өргөдөл гаргах нь:\n\nУрт догол " + "үг ".repeat(40), "application");
  assert.equal(out[0], "Title");
  assert.equal(out[1], "BodyFirst");
});

test("төгсгөлийн богино мөрүүд гарын үсгийн блок болно", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nӨргөдөл гаргасан: Б.Боролдой\n\nУтас: 99112233\n";
  const out = styles(md, "application");
  assert.deepEqual(out.slice(-3), ["Date", "SignLine", "Signature"]);
});

test("огноо гарын үсгийн өмнө орно", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nГаргасан: Б.Боролдой\n";
  const out = styles(md, "application");
  assert.equal(out.indexOf("Date") + 1, out.indexOf("SignLine"));
});

test("бүтцийн хүрээнд огноо нэмэхгүй", () => {
  const out = styles("# Тайлан\n\nДогол.\n", "report");
  assert.equal(out.includes("Date"), false);
  assert.equal(out[0], "Heading1");
});

test("бүтцийн хүрээ толгойн мөртэй", () => {
  const ir = applyTemplate(parse("# Тайлан\n\nДогол.\n"), findTemplate("report")!, { now: AT });
  assert.equal(ir.header?.pageNumberRight, true);
  assert.equal(applyTemplate(parse("# Нэр\n"), findTemplate("application")!, { now: AT }).header, undefined);
});

test("жагсаалт, хүснэгт, ишлэл хадгалагдана", () => {
  const md = "# Т\n\n- нэг\n- хоёр\n\n> иш\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const kinds = applyTemplate(parse(md), findTemplate("report")!, { now: AT }).blocks.map((b) => b.kind);
  assert.equal(kinds.includes("list"), true);
  assert.equal(kinds.includes("table"), true);
});

test("цэгээр төгссөн богино өгүүлбэр гарын үсэг болохгүй", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nБаярлалаа.\n";
  const out = styles(md, "application");
  assert.equal(out.at(-1), "Date");
  assert.equal(out.includes("SignLine"), false);
});

test("өөр үг хэллэгтэй гарын үсгийг таньна", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nХүсэлт гаргасан: Д.Дорж\n\nИ-мэйл: d@bichig.dev\n";
  const out = styles(md, "application");
  assert.deepEqual(out.slice(-2), ["SignLine", "Signature"]);
});

test("огноо аль хэдийн байвал давхардуулахгүй", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\n2026 оны 08 сарын 21\n\nБ.Боролдой\n";
  const out = styles(md, "application");
  assert.equal(out.filter((s) => s === "Date").length, 0);
});

test("гарын үсэг байхгүй бол зураас нэмэхгүй", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n";
  const out = styles(md, "application");
  assert.equal(out.includes("SignRule"), false);
  assert.equal(out.at(-1), "Date");
});

test("гарын үсгийн мөрийг зураас, налуу зураастай нэр болгоно", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nӨргөдөл гаргасан: Б. Боролдой\n";
  const ir = applyTemplate(parse(md), findTemplate("application")!, { now: AT });
  const line = ir.blocks.find((b) => b.kind === "para" && b.style === "SignLine");
  assert.ok(line && line.kind === "para");
  assert.deepEqual(line.runs, [
    { text: "Өргөдөл гаргасан:" },
    { text: "", tab: true },
    { text: "/Б. Боролдой/" },
  ]);
});

test("хоёр цэггүй мөр хуучин хэлбэрээр үлдэнэ", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nБ. Боролдой\n";
  const out = styles(md, "application");
  assert.deepEqual(out.slice(-2), ["SignRule", "SignatureTop"]);
});

test("нэр аль хэдийн налуу зураастай бол давхардуулахгүй", () => {
  const md = "# Нэр\n\n" + "Урт догол ".repeat(12) + "\n\nГаргасан: /Д.Дорж/\n";
  const ir = applyTemplate(parse(md), findTemplate("application")!, { now: AT });
  const line = ir.blocks.find((b) => b.kind === "para" && b.style === "SignLine");
  assert.ok(line && line.kind === "para");
  assert.equal(line.runs.at(-1)?.text, "/Д.Дорж/");
});
