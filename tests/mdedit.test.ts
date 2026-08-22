import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  headingDepthAt,
  toggleHeading,
  toggleList,
  toggleWrap,
  enterInsert,
  exampleAt,
  insertTable,
  minimalDiff,
  toggleQuote,
  wrapLink,
} from "../src/mdedit.ts";

/** Тэмдэглэлийг `|` тэмдгээр илэрхийлсэн товч бичлэг. */
function at(marked: string): { text: string; start: number; end: number } {
  const start = marked.indexOf("|");
  const rest = marked.slice(0, start) + marked.slice(start + 1);
  const end = rest.indexOf("|");
  return end < 0
    ? { text: rest, start, end: start }
    : { text: rest.slice(0, end) + rest.slice(end + 1), start, end };
}

function show(e: { text: string; start: number; end: number }): string {
  return e.start === e.end
    ? e.text.slice(0, e.start) + "|" + e.text.slice(e.start)
    : e.text.slice(0, e.start) +
        "|" +
        e.text.slice(e.start, e.end) +
        "|" +
        e.text.slice(e.end);
}

function wrap(marked: string, marker: string): string {
  const { text, start, end } = at(marked);
  return show(toggleWrap(text, start, end, marker));
}

function heading(marked: string, depth: 1 | 2 | 3): string {
  const { text, start, end } = at(marked);
  return show(toggleHeading(text, start, end, depth));
}

function list(marked: string, ordered: boolean): string {
  const { text, start, end } = at(marked);
  return show(toggleList(text, start, end, ordered));
}

// ---------------------------------------------------------------- toggleWrap

test("тэмдэглэсэн үгийг тодруулна", () => {
  assert.equal(wrap("энэ |үг| тод", "**"), "энэ **|үг|** тод");
});

test("гадна талын маркерыг тайлна", () => {
  assert.equal(wrap("энэ **|үг|** тод", "**"), "энэ |үг| тод");
});

test("дотор талын маркерыг тайлна", () => {
  assert.equal(wrap("энэ |**үг**| тод", "**"), "энэ |үг| тод");
});

test("тэмдэглэлийн захын зайг гадуур үлдээнэ", () => {
  assert.equal(wrap("энэ |үг |тод", "**"), "энэ **|үг|** тод");
});

test("хоосон тэмдэглэлд хос маркер оруулна", () => {
  assert.equal(wrap("энэ | тод", "**"), "энэ **|** тод");
});

test("хоосон тэмдэглэл маркерын дунд байвал тайлна", () => {
  assert.equal(wrap("энэ **|** тод", "**"), "энэ | тод");
});

test("налуу нь тодын маркерыг хазахгүй", () => {
  // `*`-аар тайлах гэж `**`-ийн хагасыг авахгүй байх ёстой
  assert.equal(wrap("энэ **|үг|** тод", "*"), "энэ ***|үг|*** тод");
});

test("олон үгийг нэг дор хүрээлнэ", () => {
  assert.equal(wrap("|энэ бол| тод", "**"), "**|энэ бол|** тод");
});

test("налуу маркер тусад нь ажиллана", () => {
  assert.equal(wrap("энэ |үг| налуу", "*"), "энэ *|үг|* налуу");
  assert.equal(wrap("энэ *|үг|* налуу", "*"), "энэ |үг| налуу");
});

// ------------------------------------------------------------- toggleHeading

test("доголыг гарчиг болгоно", () => {
  assert.equal(heading("Оршил|", 1), "# Оршил|");
});

test("гарчгийн түвшинг солино", () => {
  assert.equal(heading("# Оршил|", 2), "## Оршил|");
});

test("ижил түвшин дахин дарахад гарчиг арилна", () => {
  assert.equal(heading("# Оршил|", 1), "Оршил|");
});

test("гарчиг болгоход жагсаалтын тэмдэглэгээ арилна", () => {
  assert.equal(heading("- Оршил|", 1), "# Оршил|");
});

test("олон мөрөнд нэг дор үйлчилнэ", () => {
  assert.equal(
    heading("|Нэг\nХоёр|", 2),
    "|## Нэг\n## Хоёр|",
  );
});

test("хоосон мөрийг алгасна", () => {
  assert.equal(heading("|Нэг\n\nХоёр|", 1), "|# Нэг\n\n# Хоёр|");
});

test("бүх мөр ижил түвшинтэй бол бүгдээс нь авна", () => {
  assert.equal(heading("|## Нэг\n## Хоёр|", 2), "|Нэг\nХоёр|");
});

test("зарим мөр өөр түвшинтэй бол бүгдийг тэгшитгэнэ", () => {
  assert.equal(heading("|# Нэг\nХоёр|", 2), "|## Нэг\n## Хоёр|");
});

test("угтварын дотор байсан заагч угтварын ард гарна", () => {
  const { text, start, end } = at("#| Оршил");
  const e = toggleHeading(text, start, end, 3);
  assert.equal(e.text, "### Оршил");
  assert.equal(e.start, 4);
});

test("сүүлийн мөрөнд үйлчлэхэд өмнөх мөр хөндөгдөхгүй", () => {
  assert.equal(heading("Эхний мөр\nХоёр|", 1), "Эхний мөр\n# Хоёр|");
});

// ---------------------------------------------------------------- toggleList

test("цэгт жагсаалт болгоно", () => {
  assert.equal(list("Нэг|", false), "- Нэг|");
});

test("дугаарласан жагсаалт дараалан дугаарлана", () => {
  assert.equal(list("|Нэг\nХоёр\nГурав|", true), "|1. Нэг\n2. Хоёр\n3. Гурав|");
});

test("ижил төрөл дахин дарахад жагсаалт арилна", () => {
  assert.equal(list("|- Нэг\n- Хоёр|", false), "|Нэг\nХоёр|");
});

test("цэгтээс дугаарласан уруу шилжинэ", () => {
  assert.equal(list("|- Нэг\n- Хоёр|", true), "|1. Нэг\n2. Хоёр|");
});

test("дугаарлалт хоосон мөрийг тоолохгүй", () => {
  assert.equal(list("|Нэг\n\nХоёр|", true), "|1. Нэг\n\n2. Хоёр|");
});

// ------------------------------------------------------------ headingDepthAt

test("гарчгийн түвшинг заана", () => {
  assert.equal(headingDepthAt("## Оршил", 4), 2);
  assert.equal(headingDepthAt("Оршил", 2), 0);
  assert.equal(headingDepthAt("#Оршил", 3), 0);
});

test("олон мөрт зөв мөрийг үзнэ", () => {
  const text = "# Нэг\nэнгийн\n### Гурав";
  assert.equal(headingDepthAt(text, 0), 1);
  assert.equal(headingDepthAt(text, 8), 0);
  assert.equal(headingDepthAt(text, 16), 3);
});

// ---------------------------------------------------------------- enterInsert

/** Хүснэгтийн мөр өөрөө `|` агуулдаг тул энд заагчийг `\u2038` тэмдгээр заана. */
function ins(marked: string): string {
  const start = marked.indexOf("\u2038");
  return enterInsert(marked.slice(0, start) + marked.slice(start + 1), start);
}

test("ердийн доголд хоёр мөр оруулна", () => {
  assert.equal(ins("Хүндэт захирал аа,\u2038"), "\n\n");
});

test("мөрийн дунд ч хоёр мөр", () => {
  assert.equal(ins("Эхний өгүүлбэр.\u2038 Хоёр дахь."), "\n\n");
});

test("хоосон мөрөнд нэг мөр", () => {
  assert.equal(ins("Догол\n\u2038"), "\n");
});

test("зөвхөн зайтай мөрөнд нэг мөр", () => {
  assert.equal(ins("Догол\n   \u2038"), "\n");
});

test("цэгт жагсаалтад нэг мөр", () => {
  assert.equal(ins("- Нэг дэх зүйл\u2038"), "\n");
});

test("дугаарласан жагсаалтад нэг мөр", () => {
  assert.equal(ins("1. Нэг дэх зүйл\u2038"), "\n");
});

test("ухарсан жагсаалтад нэг мөр", () => {
  assert.equal(ins("  - Дэд зүйл\u2038"), "\n");
});

test("ишлэлд нэг мөр", () => {
  assert.equal(ins("> Иш татсан үг\u2038"), "\n");
});

test("хүснэгтийн сүүлийн эгнээнд нэг мөр", () => {
  assert.equal(ins("| a | b |\n|---|---|\n| 1 | 2 |\u2038"), "\n");
});

test("хүснэгтийн толгойн мөрөнд нэг мөр", () => {
  assert.equal(ins("| a | b |\u2038\n|---|---|"), "\n");
});

test("шугамгүй хүснэгтийн эгнээнд нэг мөр", () => {
  assert.equal(ins("a | b\u2038\n---|---"), "\n");
});

test("хоолойтой ердийн өгүүлбэрт хоёр мөр", () => {
  assert.equal(ins("Сонголт нь тийм | үгүй хоёр байна\u2038"), "\n\n");
});

test("кодын хашлаганд нэг мөр", () => {
  assert.equal(ins("```\nconst a = 1;\u2038\n```"), "\n");
});

test("хашлагын гадна хоёр мөр", () => {
  assert.equal(ins("```\nкод\n```\n\nДараах догол\u2038"), "\n\n");
});

test("гарчгийн дараа хоёр мөр", () => {
  assert.equal(ins("# Оршил\u2038"), "\n\n");
});

// --------------------------------------------------------------- minimalDiff

test("ижил бичвэрт өөрчлөлт байхгүй", () => {
  assert.equal(minimalDiff("нэг", "нэг"), null);
});

test("оруулга", () => {
  assert.deepEqual(minimalDiff("энэ үг", "энэ тод үг"), {
    from: 4,
    to: 4,
    insert: "тод ",
  });
});

test("устгалт", () => {
  assert.deepEqual(minimalDiff("энэ тод үг", "энэ үг"), {
    from: 4,
    to: 8,
    insert: "",
  });
});

test("орлуулга", () => {
  assert.deepEqual(minimalDiff("# Оршил", "### Оршил"), {
    from: 1,
    to: 1,
    insert: "##",
  });
});

test("давхцсан төгсгөл", () => {
  assert.deepEqual(minimalDiff("аа", "ааа"), { from: 2, to: 2, insert: "а" });
});

test("бүхэлдээ өөр", () => {
  assert.deepEqual(minimalDiff("нэг", "хоёр"), {
    from: 0,
    to: 3,
    insert: "хоёр",
  });
});

test("хоосноос эхлэх", () => {
  assert.deepEqual(minimalDiff("", "шинэ"), { from: 0, to: 0, insert: "шинэ" });
});


// --------------------------------------------------------------- toggleQuote

test("доголыг ишлэл болгоно", () => {
  const { text, start, end } = at("Иш татсан үг|");
  assert.equal(show(toggleQuote(text, start, end)), "> Иш татсан үг|");
});

test("ишлэлийг буцаана", () => {
  const { text, start, end } = at("> Иш татсан үг|");
  assert.equal(show(toggleQuote(text, start, end)), "Иш татсан үг|");
});

test("олон мөрийг нэг дор ишлэнэ", () => {
  const { text, start, end } = at("|Нэг\nХоёр|");
  assert.equal(show(toggleQuote(text, start, end)), "|> Нэг\n> Хоёр|");
});

test("зарим мөр ишлэлгүй бол бүгдийг ишлэнэ", () => {
  const { text, start, end } = at("|> Нэг\nХоёр|");
  assert.equal(show(toggleQuote(text, start, end)), "|> Нэг\n> Хоёр|");
});

// ------------------------------------------------------------------ wrapLink

test("тэмдэглэсэн үгийг холбоосын нэр болгоно", () => {
  const { text, start, end } = at("энэ |нэр| холбоос");
  const e = wrapLink(text, start, end);
  assert.equal(e.text, "энэ [нэр]() холбоос");
  assert.equal(e.start, 10);
  assert.equal(e.end, 10);
});

test("тэмдэглэсэн хаягийг хаягийн байранд тавина", () => {
  const { text, start, end } = at("|https://bichig.dev|");
  const e = wrapLink(text, start, end);
  assert.equal(e.text, "[](https://bichig.dev)");
  assert.equal(e.start, 1);
});

test("хоосон тэмдэглэлд араг яс оруулна", () => {
  const { text, start, end } = at("энэ |");
  const e = wrapLink(text, start, end);
  assert.equal(e.text, "энэ []()");
  assert.equal(e.start, 5);
});

// ---------------------------------------------------------------- insertTable

test("хоосон мөрөнд хүснэгт оруулна", () => {
  const e = insertTable("", 0);
  assert.equal(
    e.text,
    "| Багана 1 | Багана 2 |\n| --- | --- |\n|     |     |",
  );
  assert.equal(e.text.slice(e.start, e.end), "Багана 1");
});

test("бичвэртэй мөрийн ард хоосон мөр үлдээнэ", () => {
  const e = insertTable("Догол", 5);
  assert.equal(e.text.startsWith("Догол\n\n| Багана 1"), true);
  assert.equal(e.text.slice(e.start, e.end), "Багана 1");
});

test("оруулсан хүснэгт задлан шинжлэгдэнэ", async () => {
  const { parse } = await import("../src/markdown.ts");
  const e = insertTable("Догол", 5);
  const kinds = parse(e.text).map((b) => b.type);
  assert.deepEqual(kinds, ["paragraph", "table"]);
});

// --------------------------------------------------------------- exampleAt

const EX = ["Эхний жишээ өгүүлбэр.", "Хоёр дахь жишээ өгүүлбэр."];

test("жишээ цогцолборыг бүтнээр нь олно", () => {
  const text = "# Гарчиг\n\nЭхний жишээ өгүүлбэр.\n\nХоёр дахь жишээ өгүүлбэр.\n";
  const at = text.indexOf("Эхний") + 3;
  const f = exampleAt(text, at, EX)!;
  assert.equal(text.slice(f.start, f.end), "Эхний жишээ өгүүлбэр.");
});

test("гарчгийг жишээ гэж үзэхгүй", () => {
  const text = "# Гарчиг\n\nЭхний жишээ өгүүлбэр.\n";
  assert.equal(exampleAt(text, 3, EX), null);
});

test("засварласан цогцолборыг таних болино", () => {
  const text = "# Гарчиг\n\nЭхний жишээ өгүүлбэрX.\n";
  assert.equal(exampleAt(text, text.indexOf("Эхний") + 3, EX), null);
});

test("олон мөрт цогцолборыг бүтнээр авна", () => {
  const many = ["Эхний мөр\nхоёр дахь мөр"];
  const text = "Эхний мөр\nхоёр дахь мөр\n\nБусад\n";
  const f = exampleAt(text, 12, many)!;
  assert.equal(text.slice(f.start, f.end), "Эхний мөр\nхоёр дахь мөр");
});

test("хоосон мөрөнд null", () => {
  const text = "Эхний жишээ өгүүлбэр.\n\n\nБусад\n";
  assert.equal(exampleAt(text, 22, EX), null);
});

test("жишээгүй бол null", () => {
  assert.equal(exampleAt("ямар нэг бичвэр", 3, []), null);
});

test("гарчгийн тэмдэглэгээг тэмдэглэлд оруулахгүй", () => {
  const ex = ["Хаяглагч блок"];
  const text = "# Хаяглагч блок\n\nБусад бичвэр.\n";
  const f = exampleAt(text, 5, ex)!;
  assert.equal(text.slice(f.start, f.end), "Хаяглагч блок");
  assert.equal(f.start, 2);
});

test("тод, налуу ээлжлэн дарахад од хуримтлагдахгүй", () => {
  let text = "энэ үг тод";
  let start = 4;
  let end = 6;
  for (const marker of ["**", "*", "**", "*", "**", "*", "**", "*"]) {
    const e = toggleWrap(text, start, end, marker);
    text = e.text;
    start = e.start;
    end = e.end;
    assert.equal(text.slice(start, end), "үг");
    assert.equal(/\*{4,}/.test(text), false, text);
  }
  assert.equal(text, "энэ үг тод");
});

test("тодыг налуу болгож нэмнэ", () => {
  const e = toggleWrap("энэ **үг** тод", 6, 8, "*");
  assert.equal(e.text, "энэ ***үг*** тод");
});

test("хоёулангаас тодыг авна", () => {
  const e = toggleWrap("энэ ***үг*** тод", 7, 9, "**");
  assert.equal(e.text, "энэ *үг* тод");
});

test("хоёулангаас налууг авна", () => {
  const e = toggleWrap("энэ ***үг*** тод", 7, 9, "*");
  assert.equal(e.text, "энэ **үг** тод");
});

test("дарж зурахыг тайлна", () => {
  const e = toggleWrap("энэ ~~үг~~ тод", 6, 8, "~~");
  assert.equal(e.text, "энэ үг тод");
});

test("кодыг тайлна", () => {
  const e = toggleWrap("энэ `үг` тод", 5, 7, "`");
  assert.equal(e.text, "энэ үг тод");
});
