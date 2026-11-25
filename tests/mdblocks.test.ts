import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  cycleCase,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
} from "../src/mdbar/mdedit.ts";
import {
  insertImage,
  insertPageBreak,
  wrapLink,
} from "../src/mdbar/mdinsert.ts";
import { alignAt, toggleAlign } from "../src/mdbar/mdalign.ts";

const TABLE = "| Нэр | Нас |\n| --- | --- |\n| Бат | 20 |\n| Дорж | 30 |";

test("хуудас таслах, зураг хүснэгтийн доор орно (#353)", () => {
  const end = TABLE + "\n\n\\newpage\n\n";
  assert.equal(insertPageBreak(TABLE, 3).text, end);
  assert.equal(
    insertImage(TABLE, 3, "a.png").text,
    TABLE + "\n\n![](a.png)\n\n",
  );
});

test("ишлэл доторх жагсаалт ишлэлээ хадгална (#354)", () => {
  const text = "> 1. нэг\n> 2. хоёр";
  assert.equal(
    toggleList(text, 0, text.length, false).text,
    "> - нэг\n> - хоёр",
  );
  assert.equal(toggleList("> - нэг", 0, 7, false).text, "> нэг");
});

test("хүснэгтийн мөрөн дээр ишлэл бүтэн хүснэгтэд үйлчилнэ (#355)", () => {
  const quoted = TABLE.replace(/^/gm, "> ");
  assert.equal(toggleQuote(TABLE, 3, 3).text, quoted);
  assert.equal(toggleQuote(quoted, 20, 20).text, TABLE);
});

test("гарчиг, жагсаалт хүснэгтийн мөрийг өөрчлөхгүй (#356)", () => {
  assert.equal(toggleHeading(TABLE, 16, 16, 2).text, TABLE);
  assert.equal(toggleList(TABLE, 0, TABLE.length, false).text, TABLE);
  const text = "Гарчиг\n" + TABLE;
  assert.equal(
    toggleHeading(text, 0, text.length, 1).text,
    "# Гарчиг\n" + TABLE,
  );
});

test("үргэлжлэл догол мөртэй дугаарлалтыг арилгана (#357)", () => {
  const text = "1. нэг\n\n   үргэлжлэл\n2. хоёр";
  assert.equal(
    toggleList(text, 0, text.length, true).text,
    "нэг\n\nүргэлжлэл\nхоёр",
  );
  assert.equal(
    toggleList("- нэг\n\n  үргэлжлэл\n- хоёр", 0, 24, true).text,
    "1. нэг\n\n   үргэлжлэл\n2. хоёр",
  );
});

test("хүснэгтийн мөрийг нүд бүрээр тодруулна (#358)", () => {
  const text = "| Нэр | Нас |\n|---|---|\n| Бат | 20 |";
  const row = text.lastIndexOf("\n") + 1;
  const bold = toggleWrap(text, row, text.length, "**");
  assert.equal(bold.text, "| Нэр | Нас |\n|---|---|\n| **Бат** | **20** |");
  assert.equal(toggleWrap(bold.text, row, bold.text.length, "**").text, text);
  assert.equal(
    toggleWrap(text, 0, text.length, "*").text,
    "| *Нэр* | *Нас* |\n|---|---|\n| *Бат* | *20* |",
  );
});

test("Aa холбоосны хаягийг өөрчлөхгүй (#359)", () => {
  const text =
    "Тайланг [Монгол Улс](https://mn.wikipedia.org/wiki/Монгол_Улс) болон https://example.com/Docs/Report.PDF хаягаас";
  let e = cycleCase(text, 0, text.length);
  assert.equal(
    e.text,
    "тайланг [монгол улс](https://mn.wikipedia.org/wiki/Монгол_Улс) болон https://example.com/Docs/Report.PDF хаягаас",
  );
  e = cycleCase(e.text, 0, e.text.length);
  assert.equal(
    e.text,
    "ТАЙЛАНГ [МОНГОЛ УЛС](https://mn.wikipedia.org/wiki/Монгол_Улс) БОЛОН https://example.com/Docs/Report.PDF ХАЯГААС",
  );
  assert.equal(e.end, e.text.length);
});

test("код блок доторх мөрийг товчнууд өөрчлөхгүй (#360)", () => {
  const text = "```\nx = 1\ny = 2\n```";
  const at = text.indexOf("y");
  assert.equal(toggleHeading(text, at, at, 1).text, text);
  assert.equal(toggleList(text, at, at, false).text, text);
  assert.equal(toggleList(text, at, at, true).text, text);
  assert.equal(
    toggleQuote(text, at, at).text,
    "> ```\n> x = 1\n> y = 2\n> ```",
  );
});

test("код товч доторх backtick-ийг хадгална (#361)", () => {
  const text = "echo `date`";
  const e = toggleWrap(text, 0, text.length, "`");
  assert.equal(e.text, "`` echo `date` ``");
  assert.equal(e.text.slice(e.start, e.end), text);
  assert.equal(toggleWrap(e.text, e.start, e.end, "`").text, text);
  assert.equal(toggleWrap(e.text, 0, e.text.length, "`").text, text);
});

test("www хаягт https:// угтвар нэмнэ (#362)", () => {
  assert.equal(
    wrapLink("www.google.com", 0, 14).text,
    "[](https://www.google.com)",
  );
});

test("grid хүснэгтийг гаднаас нь голлуулна (#364)", () => {
  const text =
    '::: {width="100%" .grid}\n| Багана 1 | Багана 2 |\n| --- | --- |\n|     |     |\n:::';
  const at = text.indexOf("Багана 1");
  const e = toggleAlign(text, at, at, "center");
  assert.equal(e.text, "::: {.center}\n" + text + "\n:::");
  assert.equal(alignAt(e.text, e.start), "center");
  assert.equal(toggleAlign(e.text, e.start, e.end, "center").text, text);
  assert.equal(
    toggleAlign(e.text, e.start, e.end, "left").text,
    "::: {.left}\n" + text + "\n:::",
  );
});

test("зэрэгцүүлэлтийн ::: мөрийг товчнууд өөрчлөхгүй (#365)", () => {
  const text = "::: {.center}\nГолд байх мөр\n:::";
  assert.equal(toggleHeading(text, 3, 3, 2).text, text);
  assert.equal(toggleList(text, 3, 3, false).text, text);
  assert.equal(toggleQuote(text, 3, 3).text, text);
  assert.equal(
    toggleHeading(text, 0, text.length, 2).text,
    "::: {.center}\n## Голд байх мөр\n:::",
  );
  assert.equal(
    toggleQuote(text, 0, text.length).text,
    "::: {.center}\n> Голд байх мөр\n:::",
  );
});
