import { resetStorage } from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { lineOffset, nthWordHit } from "../src/preview/htmlsync.ts";
import { createPdfPool, type KeptPdf } from "../src/preview/pdfcache.ts";
import {
  clampZoom,
  loadInvert,
  loadZoom,
  saveInvert,
  saveZoom,
  stepZoom,
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
