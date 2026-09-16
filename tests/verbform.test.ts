import { test } from "node:test";
import assert from "node:assert/strict";
import {
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

test("нэр үйлийн хэлбэрийг зөв дарааллаар үүсгэнэ", () => {
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

test("зорь, гар, тэгшил язгуураас нэр үйл үүсгэнэ", () => {
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

test("үгийн эхэнд байгаа нэр үйлийг язгуураас өмнө тавина", () => {
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

test("үйл үг гэж танигдсан язгуураар зөвхөн нэр үйлийг хайна", () => {
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
