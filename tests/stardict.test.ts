import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineWord,
  findHeadword,
  hasEntry,
  resolveDefinitions,
  resolveTagged,
  findTaggedHeadword,
  openStarDict,
  parseDefinition,
  parseIfo,
  stardictCompare,
  stripMarkup,
} from "../src/stardict.ts";

const encoder = new TextEncoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function buildDict(
  entries: [string, string][],
  options: {
    sametypesequence?: string;
    offsetBits?: 32 | 64;
    synonyms?: [string, string][];
    tagged?: boolean;
  } = {},
) {
  const offsetBits = options.offsetBits ?? 32;
  const sorted = [...entries].sort((left, right) =>
    stardictCompare(left[0], right[0]),
  );
  const dictChunks: Uint8Array[] = [];
  const idxChunks: Uint8Array[] = [];
  let offset = 0;
  for (const [word, definition] of sorted) {
    const body = options.sametypesequence
      ? encoder.encode(definition)
      : concat([encoder.encode("m" + definition), new Uint8Array([0])]);
    dictChunks.push(body);
    const tail = new Uint8Array(offsetBits / 8 + 4);
    const view = new DataView(tail.buffer);
    if (offsetBits === 64) {
      view.setBigUint64(0, BigInt(offset));
      view.setUint32(8, body.length);
    } else {
      view.setUint32(0, offset);
      view.setUint32(4, body.length);
    }
    idxChunks.push(encoder.encode(word), new Uint8Array([0]), tail);
    offset += body.length;
  }
  const synChunks: Uint8Array[] = [];
  const synonyms = [...(options.synonyms ?? [])].sort((left, right) =>
    stardictCompare(left[0], right[0]),
  );
  for (const [alias, target] of synonyms) {
    const position = sorted.findIndex(([word]) => word === target);
    const tail = new Uint8Array(4);
    new DataView(tail.buffer).setUint32(0, position);
    synChunks.push(encoder.encode(alias), new Uint8Array([0]), tail);
  }
  const ifo = [
    "StarDict's dict ifo file",
    "version=3.0.0",
    "bookname=Туршилт",
    "wordcount=" + String(sorted.length),
    options.offsetBits === 64 ? "idxoffsetbits=64" : "",
    options.sametypesequence
      ? "sametypesequence=" + options.sametypesequence
      : "",
    synonyms.length ? "synwordcount=" + String(synonyms.length) : "",
    options.tagged ? "x-pos-tags=1" : "",
  ].join("\n");
  return openStarDict(
    ifo,
    concat(idxChunks),
    concat(dictChunks),
    synonyms.length ? concat(synChunks) : null,
  );
}

test("parseIfo нь magic мөргүй файлыг татгалзана", () => {
  assert.equal(parseIfo("<!doctype html>"), null);
});

test("parseIfo нь талбаруудыг уншина", () => {
  const info = parseIfo(
    "\uFEFFStarDict's dict ifo file\nbookname=Толь\nwordcount=3\nsametypesequence=m\n",
  );
  assert.deepEqual(info, {
    bookname: "Толь",
    wordcount: 3,
    idxoffsetbits: 32,
    sametypesequence: "m",
    synwordcount: 0,
    posTagged: false,
  });
});

test("stardictCompare нь ASCII-г том жижгээр ялгахгүй эрэмбэлнэ", () => {
  assert.ok(stardictCompare("apple", "Banana") < 0);
  assert.ok(stardictCompare("Apple", "apple") < 0);
  assert.ok(stardictCompare("ном", "номын") < 0);
});

test("defineWord нь яг таарсан толгой үгийг олно", () => {
  const dict = buildDict([
    ["ном", "бичиг, судар"],
    ["номын", "номд холбогдох"],
    ["луу", "үлгэрийн амьтан"],
  ]);
  assert.deepEqual(defineWord(dict, "ном"), [
    { headword: "ном", text: "бичиг, судар", pos: [] },
  ]);
  assert.deepEqual(defineWord(dict, "но"), []);
});

test("том үсгээр эхэлсэн саналыг жижиг үсгээр хайна", () => {
  const dict = buildDict([["ном", "бичиг"]], { sametypesequence: "m" });
  assert.equal(hasEntry(dict, "Ном"), true);
  assert.equal(hasEntry(dict, "Номын"), false);
});

test("бүтэн том үсэгтэй толгой үгийг жижиг үсгээр олно", () => {
  const dict = buildDict([
    ["НОМ", "бичиг"],
    ["байх аргагүй", "хэлц"],
  ]);
  assert.equal(hasEntry(dict, "ном"), true);
  assert.equal(hasEntry(dict, "Ном"), true);
  assert.deepEqual(defineWord(dict, "ном"), [
    { headword: "НОМ", text: "бичиг", pos: [] },
  ]);
});

test("яг таарахгүй бол язгуураар хайна", () => {
  const dict = buildDict([
    ["НОМ", "бичиг"],
    ["ДЭВТЭР", "цаас"],
  ]);
  const stems = (word: string) => () =>
    word === "номын" ? ["ном"] : word === "дэвтрийг" ? ["дэвтэр"] : [];
  assert.equal(findHeadword(dict, "номын", stems("номын")), "НОМ");
  assert.equal(findHeadword(dict, "ааа", stems("ааа")), null);
  assert.deepEqual(resolveDefinitions(dict, "дэвтрийг", stems("дэвтрийг")), [
    { headword: "ДЭВТЭР", text: "цаас", pos: [] },
  ]);
});

test("яг таарсан үг байвал язгуурыг тооцохгүй", () => {
  const dict = buildDict([
    ["НИСГЭГЧ", "жолооч"],
    ["НИСЭХ", "агаарт хөөрөх"],
  ]);
  let called = false;
  const stems = () => {
    called = true;
    return ["нисэх"];
  };
  assert.equal(findHeadword(dict, "нисгэгч", stems), "НИСГЭГЧ");
  assert.equal(resolveDefinitions(dict, "нисгэгч", stems).length, 1);
  assert.equal(called, false);
});

test("оноосон нэрийг зөвхөн том үсгээр эхэлсэн толгой үгээс хайна", () => {
  const dict = buildDict([
    ["ЗЭРЭГ", "хамт цуг"],
    ["Зэрэг", "газрын нэр"],
    ["НОМ", "бичиг"],
  ]);
  const stems = () => ["зэрэг"];
  assert.equal(findHeadword(dict, "Зэрэгээр", stems, "proper"), "Зэрэг");
  assert.deepEqual(resolveDefinitions(dict, "Зэрэгээр", stems, "proper"), [
    { headword: "Зэрэг", text: "газрын нэр", pos: [] },
  ]);
  assert.equal(hasEntry(dict, "Ном", "proper"), false);
  assert.equal(hasEntry(dict, "Ном"), true);
});

test("давхардсан толгой үгийг бүгдийг нь буцаана", () => {
  const dict = buildDict([
    ["хаан", "эзэн"],
    ["хаан", "шатрын хүү"],
  ]);
  assert.equal(defineWord(dict, "хаан").length, 2);
});

test("64 битийн offset-той idx-ийг уншина", () => {
  const dict = buildDict([["тагтаа", "шувуу"]], { offsetBits: 64 });
  assert.deepEqual(defineWord(dict, "тагтаа"), [
    { headword: "тагтаа", text: "шувуу", pos: [] },
  ]);
});

test("ifo-ийн wordcount зөрвөл алдаа шиднэ", () => {
  const good = buildDict([["ном", "бичиг"]]);
  assert.throws(() =>
    openStarDict(
      "StarDict's dict ifo file\nwordcount=2\n",
      good.index.bytes,
      good.dict,
    ),
  );
});

test("parseDefinition нь sametypesequence доторх binary талбарыг алгасна", () => {
  const binary = new Uint8Array([0, 0, 0, 2, 9, 9]);
  const data = concat([binary, encoder.encode("тайлбар")]);
  assert.deepEqual(parseDefinition(data, "Wm"), [
    { type: "m", text: "тайлбар" },
  ]);
});

test("stripMarkup нь HTML-ийг аюулгүй текст болгоно", () => {
  assert.equal(
    stripMarkup(
      "<b>луу</b><br>амьтан &amp; <script>alert(1)</script>ургамал&#x21;",
    ),
    "луу\nамьтан & ургамал!",
  );
});

test("syn файлаар холбогдсон язгуураар оруулгыг олно", () => {
  const dict = buildDict([["ОРОХ", "дотогш явах"]], {
    synonyms: [["ор", "ОРОХ"]],
  });
  assert.equal(hasEntry(dict, "ор"), true);
  assert.equal(dict.info.synwordcount, 1);
});

function taggedDict() {
  return buildDict(
    [
      ["ОР", "<gr>нэр</gr> унтах тавцан"],
      ["ОРОХ", "<gr>үйл.</gr> дотогш явах"],
      ["ТЭГШЛЭХ", "<gr>үйл</gr> тэгш болгох"],
    ],
    {
      sametypesequence: "x",
      tagged: true,
      synonyms: [
        ["ор", "ОРОХ"],
        ["тэгшил", "ТЭГШЛЭХ"],
      ],
    },
  );
}

test("tag-тай толь ifo-оос танигдаж, <gr>-ийг задална", () => {
  const dict = taggedDict();
  assert.equal(dict.info.posTagged, true);
  assert.deepEqual(defineWord(dict, "орох"), [
    { headword: "ОРОХ", text: "үйл. дотогш явах", pos: ["үйл."] },
  ]);
});

test("tag-тай толинд үйл үгийн язгуураар зөвхөн үйл үгийг авна", () => {
  const dict = taggedDict();
  const verb = () => [{ stem: "ор", verb: true }];
  const noun = () => [{ stem: "ор", verb: false }];
  assert.equal(findTaggedHeadword(dict, "орсон", verb), "ОРОХ");
  assert.equal(findTaggedHeadword(dict, "орыг", noun), "ОР");
  assert.deepEqual(
    resolveTagged(dict, "тэгшилсэн", () => [
      { stem: "тэгшил", verb: true },
    ]).map((entry) => entry.headword),
    ["ТЭГШЛЭХ"],
  );
});

test("tag-тай толинд үйл үгийн tag-гүй оруулгыг үйл үгэнд өгөхгүй", () => {
  const dict = taggedDict();
  assert.equal(
    findTaggedHeadword(dict, "нэрсэн", () => [{ stem: "ор", verb: false }]),
    "ОР",
  );
  assert.equal(
    findTaggedHeadword(dict, "ааасан", () => [{ stem: "ааа", verb: true }]),
    null,
  );
});
