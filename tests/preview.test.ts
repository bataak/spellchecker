import { resetStorage } from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { lineOffset, nthWordHit } from "../src/preview/htmlsync.ts";
import { createPdfPool, type KeptPdf } from "../src/preview/pdfcache.ts";
import { explainTexError } from "../src/preview/texpreview.ts";
import {
  canvasDensity,
  clampZoom,
  loadInvert,
  loadZoom,
  pinchZoom,
  saveInvert,
  saveZoom,
  stepZoom,
  touchMid,
  touchSpan,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/preview/viewprefs.ts";

beforeEach(resetStorage);

const kept = (text: string): KeptPdf => ({
  text,
  pdf: new Uint8Array([1]),
  missing: [],
});

test("stepZoom: дараагийн шат руу шилжиж, хязгаараас гарахгүй", () => {
  assert.equal(stepZoom(1, 1), 1.1);
  assert.equal(stepZoom(1, -1), 0.9);
  assert.equal(stepZoom(1.05, 1), 1.1);
  assert.equal(stepZoom(1.05, -1), 1);
  assert.equal(stepZoom(ZOOM_MAX, 1), ZOOM_MAX);
  assert.equal(stepZoom(ZOOM_MIN, -1), ZOOM_MIN);
});

test("clampZoom: мянганы нарийвчлалтай, хязгаарт багтаана", () => {
  assert.equal(clampZoom(1.23456), 1.235);
  assert.equal(clampZoom(10), ZOOM_MAX);
  assert.equal(clampZoom(0.01), ZOOM_MIN);
});

test("wheelZoom: хулганы дугуй шатаар, touchpad жигд томруулна", () => {
  assert.equal(wheelZoom(1, { deltaY: -100, deltaMode: 0 }), 1.1);
  assert.equal(wheelZoom(1, { deltaY: 3, deltaMode: 1 }), 0.9);
  const smooth = wheelZoom(1, { deltaY: -10.5, deltaMode: 0 });
  assert.ok(smooth > 1 && smooth < 1.2);
});

test("ZOOM_MAX 600% хүртэл томруулна", () => {
  assert.equal(ZOOM_MAX, 6);
  assert.equal(stepZoom(3, 1), 4);
  assert.equal(stepZoom(6, -1), 5);
});

test("canvasDensity: canvas-ийн пикселийг хязгаарт багтаана", () => {
  const a4 = Math.SQRT2;
  assert.equal(canvasDensity(350, a4, 2, 12_000_000), 2);
  const big = canvasDensity(2100, a4, 2, 12_000_000);
  assert.ok(big < 2);
  const pixels = 2100 * big;
  assert.ok(Math.abs(pixels * pixels * a4 - 12_000_000) < 1);
  assert.equal(canvasDensity(0, a4, 2, 12_000_000), 2);
});

test("pinchZoom: хоёр хурууны зайн харьцаагаар томруулна", () => {
  const a = { clientX: 0, clientY: 0 };
  const b = { clientX: 30, clientY: 40 };
  assert.equal(touchSpan(a, b), 50);
  assert.deepEqual(touchMid(a, b), { x: 15, y: 20 });
  assert.equal(pinchZoom(1, 100, 150), 1.5);
  assert.equal(pinchZoom(1.2, 100, 50), 0.6);
  assert.equal(pinchZoom(2, 100, 400), ZOOM_MAX);
  assert.equal(pinchZoom(1, 100, 10), ZOOM_MIN);
  assert.equal(pinchZoom(1.25, 0, 80), 1.25);
});

test("zoom ба invert тохиргоог хадгалж уншина", () => {
  assert.equal(loadZoom(), 1);
  saveZoom(1.5);
  assert.equal(loadZoom(), 1.5);
  saveZoom(1);
  assert.equal(loadZoom(), 1);
  assert.equal(loadInvert(), true);
  saveInvert(false);
  assert.equal(loadInvert(), false);
});

test("lineOffset: мөрийн эхлэлийн байрлал", () => {
  assert.equal(lineOffset("ab\ncd\nef", 0), 0);
  assert.equal(lineOffset("ab\ncd\nef", 2), 6);
  assert.equal(lineOffset("ab", 5), 2);
});

test("nthWordHit: үгийн n дэх давталтыг том жижиг үсэг үл хамааран олно", () => {
  assert.deepEqual(nthWordHit("Үг нэг үг хоёр ҮГ", "үг", 2), {
    index: 15,
    length: 2,
  });
  assert.deepEqual(nthWordHit("үг нэг", "үг", 5), { index: 0, length: 2 });
  assert.equal(nthWordHit("нэг хоёр", "үг", 0), null);
});

test("createPdfPool: сүүлд хэрэглэсэн гурвыг үлдээнэ", () => {
  const pool = createPdfPool();
  for (const key of ["a", "b", "c"]) pool.put(key, kept(key));
  assert.equal(pool.touch("a")?.text, "a");
  pool.keep("d", kept("d"), null, null);
  assert.equal(pool.get("b"), undefined);
  assert.equal(pool.get("a")?.text, "a");
  assert.equal(pool.get("d")?.text, "d");
});

test("createPdfPool: ижил түлхүүрийн хөрвүүлэлтийг нэгтгэнэ", async () => {
  const pool = createPdfPool();
  let runs = 0;
  const compile = async () => {
    runs++;
    return { pdf: new Uint8Array([runs]), missing: [] };
  };
  const first = pool.compile("k", compile);
  const second = pool.compile("k", compile);
  assert.equal(first, second);
  assert.equal(pool.running("k"), first);
  assert.equal(pool.running("x"), null);
  await first;
  assert.equal(runs, 1);
  assert.equal(pool.running("k"), null);
});

test("explainTexError тайлбаргүй алдаанд ерөнхий мэдэгдэл өгнө", () => {
  assert.equal(explainTexError(null, true), "PDF үүсгэж чадсангүй");
  assert.equal(
    explainTexError(new Error("Undefined control"), true),
    "Undefined control",
  );
});

test("explainTexError сүлжээний алдааг аюулгүй байдлаар нь ялгана", () => {
  const error = new Error("Failed to fetch dynamically imported module");
  assert.match(explainTexError(error, true), /нэг удаа онлайн/);
  assert.match(explainTexError(error, false), /HTTPS биш/);
});
