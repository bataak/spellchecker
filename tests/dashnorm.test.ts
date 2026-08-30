import test from "node:test";
import assert from "node:assert/strict";
import {
  dashSpan,
  dashNormalized,
  dashNormalizeApply,
  isAbbrev,
} from "../src/textcheck.ts";

test("span covers abbreviation, dash and suffix", () => {
  const text = "ОЖД\u2013аас ирсэн";
  assert.deepEqual(dashSpan(text, { word: "аас", start: 4 }), {
    word: "ОЖД\u2013аас",
    start: 0,
    end: 7,
  });
});

test("all long dash variants are covered", () => {
  for (const dash of [
    "\u2010",
    "\u2011",
    "\u2012",
    "\u2013",
    "\u2014",
    "\u2015",
    "\u2212",
    "\uFF0D",
  ]) {
    const text = "МУИС" + dash + "ийн";
    const span = dashSpan(text, { word: "ийн", start: 5 });
    assert.equal(span?.word, "МУИС" + dash + "ийн");
    assert.equal(
      dashNormalized(span!.word),
      "МУИС-ийн",
      "dash " + dash.codePointAt(0),
    );
  }
});

test("ASCII dash produces no span", () => {
  assert.equal(dashSpan("ОЖД-аас", { word: "аас", start: 4 }), null);
});

test("year range is left alone", () => {
  assert.equal(
    dashSpan("1990\u20132000 онд", { word: "2000", start: 5 }),
    null,
  );
});

test("uppercase suffix is left alone", () => {
  assert.equal(dashSpan("МУИС\u2013ЫН", { word: "ЫН", start: 5 }), null);
});

test("proper noun pair is left alone", () => {
  assert.equal(
    dashSpan("Улаанбаатар\u2013Дархан", { word: "Дархан", start: 12 }),
    null,
  );
});

test("lowercase left side is left alone", () => {
  assert.equal(dashSpan("хот\u2013ын", { word: "ын", start: 4 }), null);
});

test("latin abbreviation is left alone", () => {
  assert.equal(dashSpan("NASA\u2013гийн", { word: "гийн", start: 5 }), null);
});

test("single letter left side is left alone", () => {
  assert.equal(dashSpan("А\u2013аас", { word: "аас", start: 2 }), null);
});

test("spaced dash is left alone", () => {
  assert.equal(dashSpan("ОЖД \u2013 аас", { word: "аас", start: 6 }), null);
});

test("abbreviation glued to latin or digits is left alone", () => {
  assert.equal(dashSpan("X4ОЖД\u2013аас", { word: "аас", start: 6 }), null);
});

test("abbreviation after an opening bracket is accepted", () => {
  const span = dashSpan("(ОЖД\u2013аас)", { word: "аас", start: 5 });
  assert.deepEqual(span, { word: "ОЖД\u2013аас", start: 1, end: 8 });
});

test("normalization returns null when there is nothing to fix", () => {
  assert.equal(dashNormalized("ОЖД-аас"), null);
  assert.equal(dashNormalized("аас"), null);
});

test("apply rewrites the span and keeps length", () => {
  const text = "ОЖД\u2013аас ирсэн";
  const span = dashSpan(text, { word: "аас", start: 4 })!;
  const got = dashNormalizeApply(text, span, "ОЖД-аас");
  assert.equal(got?.text, "ОЖД-аас ирсэн");
  assert.equal(got?.text.length, text.length);
  assert.equal(got?.caret, 7);
});

test("apply refuses a replacement it did not offer", () => {
  const text = "ОЖД\u2013аас";
  const span = dashSpan(text, { word: "аас", start: 4 })!;
  assert.equal(dashNormalizeApply(text, span, "агс"), null);
});

test("apply refuses when the text no longer matches the span", () => {
  const span = dashSpan("ОЖД\u2013аас", { word: "аас", start: 4 })!;
  assert.equal(dashNormalizeApply("өөр бичвэр", span, "ОЖД-аас"), null);
});

test("apply fixes every occurrence at once", () => {
  const text = "ОЖД\u2013аас ирсэн. ОЖД\u2013аас дахин.";
  const span = dashSpan(text, { word: "аас", start: 4 })!;
  const got = dashNormalizeApply(text, span, "ОЖД-аас");
  assert.equal(got?.text, "ОЖД-аас ирсэн. ОЖД-аас дахин.");
  assert.equal(got?.text.length, text.length);
});

test("apply can be triggered from a later occurrence", () => {
  const text = "ОЖД\u2013аас ОЖД\u2013аас";
  const span = dashSpan(text, { word: "аас", start: 12 })!;
  const got = dashNormalizeApply(text, span, "ОЖД-аас");
  assert.equal(got?.text, "ОЖД-аас ОЖД-аас");
  assert.equal(got?.caret, 15);
});

test("apply skips occurrences glued to other letters", () => {
  const text = "ОЖД\u2013аас ХОЖД\u2013аас ОЖД\u2013аасны";
  const span = dashSpan(text, { word: "аас", start: 4 })!;
  const got = dashNormalizeApply(text, span, "ОЖД-аас");
  assert.equal(got?.text, "ОЖД-аас ХОЖД\u2013аас ОЖД\u2013аасны");
});

test("isAbbrev keeps its previous behaviour", () => {
  assert.equal(isAbbrev("ОЖД"), true);
  assert.equal(isAbbrev("МУИС"), true);
  assert.equal(isAbbrev("Ажил"), false);
  assert.equal(isAbbrev("А"), false);
  assert.equal(isAbbrev("NASA"), false);
});
