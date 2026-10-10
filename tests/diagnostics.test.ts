import test from "node:test";
import assert from "node:assert/strict";

import {
  ISSUE_URL,
  MAX_ISSUE_URL_LENGTH,
  USER_AGENT_MAX,
  buildIssueUrl,
  collectDiagnostics,
  entryHash,
  type DiagnosticsState,
} from "../src/diagnostics.ts";
import { toSafeError, type SafeError } from "../src/safeerror.ts";

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

function parsePayload(url: string): Record<string, unknown> & {
  errors: SafeError[];
  userAgent: string;
} {
  const u = new URL(url);
  return JSON.parse(u.searchParams.get("diagnostics")!);
}

function errorWithFrames(n: number, tag: string): SafeError {
  const frames: string[] = [];
  for (let i = 0; i < n; i++) frames.push(`chunk-${tag}-abcdefgh.js:${i}:1234`);
  return { name: "TypeError", code: "SOME_CODE", frames };
}

test("buildIssueUrl: template болон diagnostics параметр", () => {
  const d = collectDiagnostics(baseState());
  const url = buildIssueUrl(d, [errorWithFrames(2, "a")]);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, ISSUE_URL);
  assert.equal(u.searchParams.get("template"), "bug_report.yml");
  const payload = parsePayload(url);
  assert.deepEqual(payload, { ...d, errors: [errorWithFrames(2, "a")] });
  assert.ok(!url.includes("+"));
});

test("buildIssueUrl: marker текст URL-д огт гарахгүй", () => {
  const stack = [
    `Error: ${MARK}`,
    `    at f (https://aldaa.bichig.dev/${MARK}/x.js:1:2)`,
    `    at g (https://aldaa.bichig.dev/assets/index-Ab12Cd_9.js:3:4)`,
  ].join("\n");
  const e = new Error(MARK);
  Object.defineProperty(e, "stack", { value: stack });
  Object.assign(e, { code: MARK });
  const forged: SafeError = {
    name: MARK,
    code: LAT,
    frames: [`${LAT}.js:1:1x`, `${CYR}.js:1:1`, "ok.js:1:1"],
  };
  const url = buildIssueUrl(collectDiagnostics(markedState()), [
    toSafeError(e),
    toSafeError(MARK),
    forged,
  ]);
  assertNoMarker(url);
  assert.deepEqual(parsePayload(url).errors, [
    { name: "Error", code: null, frames: ["index-Ab12Cd_9.js:3:4"] },
    { name: null, code: null, frames: [] },
    { name: null, code: null, frames: ["ok.js:1:1"] },
  ]);
});

test("buildIssueUrl: богино бол бүх frame үлдэнэ", () => {
  const errors = Array.from({ length: 5 }, (_, i) =>
    errorWithFrames(8, String(i)),
  );
  const url = buildIssueUrl(collectDiagnostics(baseState()), errors);
  assert.ok(url.length <= MAX_ISSUE_URL_LENGTH);
  assert.deepEqual(parsePayload(url).errors, errors);
});

test("buildIssueUrl: урт бол эхлээд frame-ийг таслана", () => {
  const d = collectDiagnostics(baseState());
  const errors = Array.from({ length: 5 }, (_, i) =>
    errorWithFrames(8, String(i)),
  );
  const full = buildIssueUrl(d, errors, 100000).length;
  const noFrames = buildIssueUrl(
    d,
    errors.map((e) => ({ ...e, frames: [] })),
    100000,
  ).length;
  const limit = Math.floor((full + noFrames) / 2);
  const url = buildIssueUrl(d, errors, limit);
  assert.ok(url.length <= limit);
  const payload = parsePayload(url);
  assert.equal(payload.errors.length, 5);
  const counts = payload.errors.map((e) => e.frames.length);
  assert.ok(counts.every((c) => c === counts[0] && c > 0 && c < 8));
  assert.deepEqual(
    payload.errors[0]!.frames,
    errors[0]!.frames.slice(0, counts[0]),
  );
  assert.equal(payload.userAgent, d.userAgent);
});

test("buildIssueUrl: frame хүрэлцэхгүй бол хуучин алдааг хасна", () => {
  const d = collectDiagnostics(baseState());
  const errors = Array.from({ length: 5 }, (_, i) =>
    errorWithFrames(8, String(i)),
  );
  const two = buildIssueUrl(
    d,
    errors.slice(3).map((e) => ({ ...e, frames: [] })),
    100000,
  ).length;
  const url = buildIssueUrl(d, errors, two);
  assert.equal(url.length, two);
  const payload = parsePayload(url);
  assert.deepEqual(
    payload.errors,
    errors.slice(3).map((e) => ({ ...e, frames: [] })),
  );
  assert.equal(payload.userAgent, d.userAgent);
});

test("buildIssueUrl: хамгийн сүүлд userAgent-ийг таслана", () => {
  const d = collectDiagnostics({ ...baseState(), userAgent: "U".repeat(300) });
  const noErrors = buildIssueUrl(d, [], 100000).length;
  const url = buildIssueUrl(d, [errorWithFrames(8, "a")], noErrors - 100);
  assert.ok(url.length <= noErrors - 100);
  const payload = parsePayload(url);
  assert.deepEqual(payload.errors, []);
  assert.ok(payload.userAgent.length < 300);
});

test("buildIssueUrl: хэт бага хязгаарт зөвхөн template үлдэнэ", () => {
  const url = buildIssueUrl(collectDiagnostics(baseState()), [], 10);
  assert.equal(url, ISSUE_URL + "?template=bug_report.yml");
});

test("buildIssueUrl: урт state-тэй үед ч хязгаарт багтана", () => {
  const state = {
    ...baseState(),
    text: "а".repeat(1_000_000),
    personalDict: Array.from({ length: 10000 }, (_, i) => "үг" + i),
    userAgent: "M".repeat(5000),
  };
  const errors = Array.from({ length: 5 }, (_, i) =>
    errorWithFrames(8, String(i)),
  );
  const url = buildIssueUrl(collectDiagnostics(state), errors);
  assert.ok(url.length <= MAX_ISSUE_URL_LENGTH);
});
