import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bareStemInfinitives,
  completiveRoot,
  derivedRoots,
  connectingVowel,
  infinitiveCandidates,
  lookupCandidates,
  parseAnalyses,
  parseAnalysis,
  type Analysis,
} from "../src/verbform.ts";

const unknown = (...stems: string[]): Analysis[] =>
  stems.map((stem) => ({ stem, verb: null }));

test("эгшиг зохицлоор холбох эгшгийг сонгоно", () => {
  assert.equal(connectingVowel("ангижруул"), "а");
  assert.equal(connectingVowel("яв"), "а");
  assert.equal(connectingVowel("ор"), "о");
  assert.equal(connectingVowel("орчуул"), "а");
  assert.equal(connectingVowel("өг"), "ө");
  assert.equal(connectingVowel("үз"), "э");
  assert.equal(connectingVowel("ид"), "э");
  assert.equal(connectingVowel("унш"), "и");
  assert.equal(connectingVowel("бич"), "и");
});

test("үйлт нэрийн хэлбэрийг зөв дарааллаар үүсгэнэ", () => {
  assert.equal(infinitiveCandidates("ангижруул")[0], "ангижруулах");
  assert.equal(infinitiveCandidates("унш")[0], "унших");
  assert.deepEqual(infinitiveCandidates("хий"), ["хийх"]);
  assert.deepEqual(infinitiveCandidates("бай"), ["байх"]);
  assert.deepEqual(infinitiveCandidates("харь"), ["харих"]);
  assert.deepEqual(infinitiveCandidates("хөдөл").slice(0, 2), [
    "хөдөлөх",
    "хөдлөх",
  ]);
});

test("зорь, гар, тэгшил язгуураас үйлт нэр үүсгэнэ", () => {
  assert.deepEqual(infinitiveCandidates("зорь"), ["зорих"]);
  assert.deepEqual(infinitiveCandidates("гар"), [
    "гарах",
    "гарэх",
    "гарох",
    "гарөх",
    "гарих",
  ]);
  assert.deepEqual(infinitiveCandidates("тэгшил").slice(0, 2), [
    "тэгшилэх",
    "тэгшлэх",
  ]);
});

test("үгийн эхэнд байгаа үйлт нэрийг язгуураас өмнө тавина", () => {
  const valid = new Set(["орох", "ангижруулах", "явах"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(lookupCandidates("орохыг", unknown("ор"), isWord), [
    "орох",
    "ор",
  ]);
  assert.deepEqual(
    lookupCandidates("ангижруулахыг", unknown("ангижруул"), isWord),
    ["ангижруулах", "ангижруул"],
  );
  assert.deepEqual(lookupCandidates("явсан", unknown("яв"), isWord), [
    "яв",
    "явах",
  ]);
});

test("hunspell зөвшөөрөөгүй хэлбэрийг оруулахгүй", () => {
  assert.deepEqual(
    lookupCandidates("номын", unknown("ном"), () => false),
    ["ном"],
  );
});

test("analyzeWord-ийн мөрөөс язгуур болон үйл үгийн flag-ийг уншина", () => {
  assert.deepEqual(parseAnalysis(" st:ангижруул fl:F0 fl:70"), {
    stem: "ангижруул",
    verb: true,
  });
  assert.deepEqual(parseAnalysis(" st:унш fl:G0 fl:70"), {
    stem: "унш",
    verb: true,
  });
  assert.deepEqual(parseAnalysis(" st:ном fl:B1"), {
    stem: "ном",
    verb: false,
  });
  assert.deepEqual(parseAnalysis(" st:ор fl:I3"), { stem: "ор", verb: true });
  assert.equal(parseAnalysis("fl:F0"), null);
});

test("ижил язгуурын шинжилгээнүүдийг нэгтгэнэ", () => {
  assert.deepEqual(
    parseAnalyses([" st:ор fl:B1", " st:ор fl:F0", " st:орон fl:B1"]),
    [
      { stem: "ор", verb: true },
      { stem: "орон", verb: false },
    ],
  );
});

test("үйл үг гэж танигдсан язгуураар зөвхөн үйлт нэрийг хайна", () => {
  const valid = new Set(["орох", "явах"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    lookupCandidates("орсон", [{ stem: "ор", verb: true }], isWord),
    ["орох"],
  );
  assert.deepEqual(
    lookupCandidates("орыг", [{ stem: "ор", verb: false }], isWord),
    ["ор"],
  );
  assert.deepEqual(
    lookupCandidates(
      "орсон",
      [
        { stem: "ор", verb: true },
        { stem: "орс", verb: false },
      ],
      isWord,
    ),
    ["орох", "орс"],
  );
});

test("-чих хэлбэрээс үйл үгийн язгуурыг салгана", () => {
  assert.equal(completiveRoot("харчхаад"), "хар");
  assert.equal(completiveRoot("харчихаад"), "хар");
  assert.equal(completiveRoot("харчих"), "хар");
  assert.equal(completiveRoot("харьчхаад"), "харь");
  assert.equal(completiveRoot("өөрчилчихөөд"), "өөрчил");
  assert.equal(completiveRoot("ичих"), null);
  assert.equal(completiveRoot("чих"), null);
  assert.equal(completiveRoot("явсан"), null);
});

test("-чих хэлбэрээс зөвхөн эхний хүчинтэй үйлт нэрийг хайна", () => {
  const valid = new Set(["харах", "харих", "уух", "өөрчлөх", "үзэх"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(lookupCandidates("харчхаад", [], isWord), ["харах"]);
  assert.deepEqual(lookupCandidates("харьчхаад", [], isWord), ["харих"]);
  assert.deepEqual(lookupCandidates("уучхаад", [], isWord), ["уух"]);
  assert.deepEqual(lookupCandidates("үзчхээд", [], isWord), ["үзэх"]);
  assert.deepEqual(lookupCandidates("өөрчилчихөөд", [], isWord), ["өөрчлөх"]);
});

test("-чих fallback нь hunspell-ийн язгуурын дараа орно", () => {
  const valid = new Set(["харах"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    lookupCandidates("харчхаад", [{ stem: "харчхаад", verb: null }], isWord),
    ["харах"],
  );
  assert.deepEqual(
    lookupCandidates("харчих", [{ stem: "харч", verb: null }], isWord),
    ["харч", "харах"],
  );
});

test("hunspell-ийн -чих, -ч язгуураас үндсэн үйл үгийг олно", () => {
  const valid = new Set(["харчих", "харах", "харих"]);
  const isWord = (candidate: string) => valid.has(candidate);
  const analyses = parseAnalyses([" st:харчих fl:F0", " st:харч fl:G0 fl:70"]);
  for (const word of ["харчихад", "харчихдаа", "харчихаас"])
    assert.deepEqual(lookupCandidates(word, analyses, isWord), [
      "харчих",
      "харах",
    ]);
  assert.deepEqual(
    lookupCandidates("харчхаад", parseAnalyses([" st:харчих fl:F0"]), isWord),
    ["харах"],
  );
});

test("жинхэнэ -ч язгуурт илүүдэл candidate нэмэхгүй", () => {
  const valid = new Set(["бичих", "очих"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    lookupCandidates("бичсэн", [{ stem: "бич", verb: true }], isWord),
    ["бичих"],
  );
  assert.deepEqual(
    lookupCandidates("очсон", [{ stem: "оч", verb: true }], isWord),
    ["очих"],
  );
});

test("нэр үгийн -ч язгуураас үйл үг хайхгүй", () => {
  const valid = new Set(["малах"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    lookupCandidates("малчид", [{ stem: "малч", verb: false }], isWord),
    ["малч"],
  );
});

test("үйлдэхүйн болон үйлдүүлэх хэвийн залгаврыг хасна", () => {
  assert.deepEqual(derivedRoots("чуулагд"), ["чуула"]);
  assert.deepEqual(derivedRoots("хийгд"), ["хий"]);
  assert.deepEqual(derivedRoots("бичигд"), ["бичи"]);
  assert.deepEqual(derivedRoots("явуул"), ["яв"]);
  assert.deepEqual(derivedRoots("хийлгэ"), ["хий"]);
  assert.deepEqual(derivedRoots("хийлгэгд"), ["хийлгэ", "хий"]);
  assert.deepEqual(derivedRoots("чуул"), []);
  assert.deepEqual(derivedRoots("дуул"), []);
});

test("үүсмэл үйл үгээс үндсэн үйл үгийн тайлбарыг хайна", () => {
  const valid = new Set([
    "чуулагдах",
    "чуулах",
    "хийгдэх",
    "хийх",
    "бичигдэх",
    "бичих",
    "явуулах",
    "явах",
    "хийлгэх",
  ]);
  const isWord = (candidate: string) => valid.has(candidate);
  const cases: [string, string, string[]][] = [
    ["чуулагдсан", " st:чуулагд fl:F0", ["чуулагдах", "чуулах"]],
    ["хийгдэх", " st:хийгд fl:F3", ["хийгдэх", "хийх"]],
    ["бичигдсэн", " st:бичигд fl:F3", ["бичигдэх", "бичих"]],
    ["явуулах", " st:явуул fl:F0", ["явуулах", "явах"]],
    ["хийлгэсэн", " st:хийлгэ fl:F3", ["хийлгэх", "хийх"]],
  ];
  for (const [word, line, expected] of cases)
    assert.deepEqual(
      lookupCandidates(word, parseAnalyses([line]), isWord),
      expected,
    );
});

test("flag-гүй шинжилгээг үйл үг эсэх нь тодорхойгүй гэж үзнэ", () => {
  assert.deepEqual(parseAnalysis(" st:чуул"), { stem: "чуул", verb: null });
  assert.deepEqual(
    parseAnalyses([" st:агуулах", " st:агуулах fl:B0", " st:агуул fl:F0"]),
    [
      { stem: "агуулах", verb: false },
      { stem: "агуул", verb: true },
    ],
  );
  assert.deepEqual(parseAnalyses([" st:ор", " st:ор fl:F0"]), [
    { stem: "ор", verb: true },
  ]);
});

test("язгуур хэлбэрээрээ бичигдсэн үйл үгийн тайлбарыг хайна", () => {
  const valid = new Set(["чуулах", "агуулах"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    lookupCandidates("чуул", parseAnalyses([" st:чуул"]), isWord),
    ["чуулах"],
  );
  assert.deepEqual(
    lookupCandidates("агуул", parseAnalyses([" st:агуул"]), isWord),
    ["агуулах"],
  );
});

test("язгуур хэлбэрээрээ бичигдсэн үйл үгийн үйлт нэрийг олно", () => {
  const valid = new Set(["агуулах", "орох", "гарах", "харих"]);
  const isWord = (candidate: string) => valid.has(candidate);
  assert.deepEqual(
    bareStemInfinitives("агуул", parseAnalyses([" st:агуул"]), isWord),
    ["агуулах"],
  );
  assert.deepEqual(
    bareStemInfinitives("Ор", parseAnalyses([" st:ор"]), isWord),
    ["орох"],
  );
  assert.deepEqual(
    bareStemInfinitives("харь", parseAnalyses([" st:харь"]), isWord),
    ["харих"],
  );
  assert.deepEqual(
    bareStemInfinitives("ном", parseAnalyses([" st:ном"]), isWord),
    [],
  );
  assert.deepEqual(
    bareStemInfinitives("гар", [{ stem: "гар", verb: false }], isWord),
    [],
  );
  assert.deepEqual(
    bareStemInfinitives("гарсан", parseAnalyses([" st:гар fl:F0"]), isWord),
    [],
  );
});
