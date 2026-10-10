import test from "node:test";
import assert from "node:assert/strict";

import {
  USER_AGENT_MAX,
  collectDiagnostics,
  entryHash,
  type DiagnosticsState,
} from "../src/diagnostics.ts";

const CYR = "НУУЦмаркер";
const LAT = "SECRETmarker";
const MARK = `${CYR} ${LAT}`;

function baseState(): DiagnosticsState {
  return {
    appVersion: "1.100.0",
    entryUrl: "https://aldaa.bichig.dev/assets/index-Ab12Cd_9.js",
    swCachedEntry: "assets/index-Xy34Ef-0.js",
    swControlled: true,
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    activeDicts: ["en_US", "mn_MN"],
    officeActive: false,
    markdownActive: true,
    fileName: "тайлан.md",
    layout: { measure: "b", panel: true, preview: false },
    text: "сайн байна уу",
    errorWords: ["байнаа", "уу"],
    personalDict: ["бичиг", "aldaa", "dev"],
    stardict: [
      { name: "Тайлбар толь", words: 1000, user: false },
      { name: "Миний толь", words: 20, user: true },
    ],
    theme: "dark",
    standalone: false,
    online: true,
    viewport: { width: 1280.4, height: 800 },
    devicePixelRatio: 2.123,
    touch: false,
  };
}

function markedState(): DiagnosticsState {
  return {
    appVersion: `1.0.0 ${MARK}`,
    entryUrl: `https://aldaa.bichig.dev/${MARK}/index-${LAT}.js`,
    swCachedEntry: `assets/index-${CYR}.js`,
    swControlled: true,
    userAgent: `Mozilla/5.0 ${CYR}`,
    activeDicts: ["mn_MN", MARK, LAT, CYR],
    officeActive: false,
    markdownActive: false,
    fileName: `${MARK}.${LAT}`,
    layout: { measure: MARK, panel: true, preview: true },
    text: `${MARK} ${MARK}`,
    errorWords: [CYR, LAT, MARK],
    personalDict: [CYR, LAT],
    stardict: [
      { name: MARK, words: 5, user: false },
      { name: LAT, words: 1, user: true },
    ],
    theme: MARK,
    standalone: true,
    online: true,
    viewport: { width: 390, height: 844 },
    devicePixelRatio: 3,
    touch: true,
  };
}

function assertNoMarker(output: string): void {
  for (const form of [output, decodeURIComponent(output)]) {
    assert.ok(!form.includes(CYR), "кирилл marker гарлаа: " + form);
    assert.ok(!form.includes(LAT), "латин marker гарлаа: " + form);
    assert.ok(
      !form.toLowerCase().includes(LAT.toLowerCase()),
      "латин marker гарлаа: " + form,
    );
  }
}

test("collectDiagnostics: allowlist-ийн утгууд", () => {
  assert.deepEqual(collectDiagnostics(baseState()), {
    app: { version: "1.100.0", build: "Ab12Cd_9" },
    sw: { cache: "Xy34Ef-0", controlled: true },
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    languages: ["mn_MN", "en_US"],
    mode: "markdown",
    fileExt: "md",
    layout: { measure: "b", panel: true, preview: false },
    textLength: 13,
    errorCount: 2,
    personalDictWords: 3,
    stardict: { loaded: true, bundled: 1, user: 1 },
    theme: "dark",
    standalone: false,
    online: true,
    viewport: { width: 1280, height: 800 },
    devicePixelRatio: 2.12,
    touch: false,
  });
});

test("collectDiagnostics: state-ийн string талбар дахь marker гарахгүй", () => {
  const out = collectDiagnostics(markedState());
  assertNoMarker(JSON.stringify(out));
  assert.equal(out.app.version, null);
  assert.equal(out.app.build, null);
  assert.equal(out.sw.cache, null);
  assert.deepEqual(out.languages, ["mn_MN"]);
  assert.equal(out.fileExt, "other");
  assert.equal(out.layout.measure, "a");
  assert.equal(out.theme, "light");
  assert.equal(out.textLength, `${MARK} ${MARK}`.length);
});

test("collectDiagnostics: горим болон файлын extension", () => {
  const office = collectDiagnostics({
    ...baseState(),
    officeActive: true,
    fileName: "Гэрээ.DOCX",
  });
  assert.equal(office.mode, "office");
  assert.equal(office.fileExt, "docx");
  const plain = collectDiagnostics({
    ...baseState(),
    markdownActive: false,
    fileName: null,
  });
  assert.equal(plain.mode, "plain");
  assert.equal(plain.fileExt, "none");
  assert.equal(
    collectDiagnostics({ ...baseState(), fileName: "README" }).fileExt,
    "other",
  );
});

test("collectDiagnostics: StarDict ачаалагдаагүй, layout байхгүй", () => {
  const out = collectDiagnostics({
    ...baseState(),
    stardict: null,
    layout: null,
  });
  assert.deepEqual(out.stardict, { loaded: false, bundled: 0, user: 0 });
  assert.deepEqual(out.layout, { measure: "a", panel: false, preview: false });
});

test("collectDiagnostics: тоон утгыг хязгаарлана", () => {
  const out = collectDiagnostics({
    ...baseState(),
    viewport: { width: Number.NaN, height: -5 },
    devicePixelRatio: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(out.viewport, { width: 0, height: 0 });
  assert.equal(out.devicePixelRatio, 0);
});

test("collectDiagnostics: userAgent-ийг ASCII болгож таслана", () => {
  const out = collectDiagnostics({
    ...baseState(),
    userAgent: "A".repeat(1000) + "\n" + CYR,
  });
  assert.equal(out.userAgent.length, USER_AGENT_MAX);
  assert.match(out.userAgent, /^[\x20-\x7e]*$/);
});

test("entryHash: зөвхөн index-<hash>.js", () => {
  assert.equal(entryHash("/assets/index-AbCdEf12.js?x=1"), "AbCdEf12");
  assert.equal(entryHash("/src/main.ts"), null);
  assert.equal(entryHash("/notes/index-Secret12.js"), null);
  assert.equal(entryHash("/assets/index-SECRETmarker.js"), null);
  assert.equal(entryHash(null), null);
});
