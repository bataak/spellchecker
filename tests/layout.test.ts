import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_LAYOUTS,
  DEFAULT_LAYOUT,
  PREVIEW_MEASURE,
  DEFAULT_METRICS,
  HYSTERESIS,
  MEASURES,
  available,
  clamp,
  contentWidth,
  editorWidth,
  fits,
  previewWidth,
  has,
  key,
  pageWidth,
  parseLayout,
  same,
  serializeLayout,
  showsControl,
  type Layout,
  type Metrics,
} from "../src/layout.ts";

const x: Metrics = { ...DEFAULT_METRICS };

const near = (a: number, b: number, msg?: string): void =>
  assert.ok(Math.abs(a - b) < 1e-6, msg ?? `${a} ≉ ${b}`);
type M = "a" | "b" | "c";
const on = (measure: M): Layout => ({ measure, panel: true, preview: false });
const off = (measure: M): Layout => ({ measure, panel: false, preview: false });
const pv = (measure: M, panel: boolean): Layout => ({
  measure,
  panel,
  preview: true,
});

test("ALL_LAYOUTS — 12 хослол, давхардалгүй", () => {
  assert.equal(ALL_LAYOUTS.length, 12);
  assert.equal(new Set(ALL_LAYOUTS.map(key)).size, 12);
});

test("харагдац нь тогтмол, measure-ээс хамаарахгүй", () => {
  for (const m of ["a", "b", "c"] as const) {
    const want = PREVIEW_MEASURE * x.per * x.scale + 2 * x.previewPad;
    near(previewWidth(pv(m, false), x), want);
    assert.equal(previewWidth(off(m), x), 0);
    near(pageWidth(pv(m, false), x) - pageWidth(off(m), x), want + x.panelGap);
  }
});

test("харагдац ердийн дэлгэцэнд хүрнэ", () => {
  const list = available(x, 1606, []).map(key);
  assert.ok(list.includes("a-v"), `1606px дээр a-v байх ёстой: ${list}`);
});

test("contentWidth ба pageWidth нь padding-аар л ялгаатай", () => {
  for (const l of ALL_LAYOUTS) {
    near(
      pageWidth(l, x) - contentWidth(l, x),
      2 * x.pagePad - x.gutterW,
      key(l),
    );
  }
});

test("contentWidth — слотуудын нийлбэртэй тэнцэнэ", () => {
  for (const l of ALL_LAYOUTS) {
    let want = editorWidth(l.measure, x);
    if (l.preview) want += previewWidth(l, x) + x.panelGap;
    if (l.panel) want += x.panelW + x.panelGap;
    near(contentWidth(l, x), want, key(l));
  }
});

test("preview + хавтас нь хоёулангийн зайг эзэлнэ", () => {
  for (const m of ["a", "b", "c"] as const) {
    near(
      pageWidth(pv(m, true), x) - pageWidth(pv(m, false), x),
      x.panelW + x.panelGap,
    );
  }
});

test("editorWidth — тэмдэгтийн тооноос гарна", () => {
  for (const m of ["a", "b", "c"] as const) {
    near(editorWidth(m, x), MEASURES[m] * x.per + 2 * x.padX + x.gutterW, m);
  }
  assert.ok(editorWidth("a", x) < editorWidth("b", x));
  assert.ok(editorWidth("b", x) < editorWidth("c", x));
});

test("editorWidth — --editor-scale-ыг дагана", () => {
  const big = { ...x, scale: 1.25 };
  const text = MEASURES.a * x.per;
  assert.equal(
    Math.round(editorWidth("a", big)),
    Math.round(text * 1.25 + 2 * x.padX + x.gutterW),
  );
});

test("editorWidth — gutter байхгүй үед богиносно", () => {
  near(editorWidth("a", { ...x, gutterW: 0 }), editorWidth("a", x) - x.gutterW);
});

test("pageWidth — хавтас нуухад зай чөлөөлөгдөнө", () => {
  for (const m of ["a", "b", "c"] as const) {
    near(pageWidth(on(m), x) - pageWidth(off(m), x), x.panelW + x.panelGap);
  }
});

test("pageWidth — c + хавтас нь 1606px дэлгэцэнд багтана", () => {
  assert.ok(pageWidth(on("c"), x) + HYSTERESIS <= 1606);
});

test("анхдагч байрлал үргэлж боломжтой", () => {
  for (const w of [0, 320, 768, 1920]) {
    assert.equal(fits(DEFAULT_LAYOUT, x, w), true);
    assert.ok(has(available(x, w), DEFAULT_LAYOUT));
  }
});

for (const l of ALL_LAYOUTS) {
  if (same(l, DEFAULT_LAYOUT)) continue;
  test(`${key(l)} — идэвхгүй үеийн босго ±1px`, () => {
    const need = pageWidth(l, x) + HYSTERESIS;
    assert.equal(fits(l, x, need - 1, false), false);
    assert.equal(fits(l, x, need, false), true);
  });

  test(`${key(l)} — идэвхтэй үеийн босго ±1px`, () => {
    const need = pageWidth(l, x);
    assert.equal(fits(l, x, need - 1, true), false);
    assert.equal(fits(l, x, need, true), true);
  });
}

test("гистерезис — босго хооронд төлөв тогтвортой", () => {
  const l = on("b");
  const mid = pageWidth(l, x) + HYSTERESIS / 2;
  assert.equal(has(available(x, mid, []), l), false);
  assert.equal(has(available(x, mid, [l]), l), true);
});

test("available — хавтасгүй хувилбар нам босготой", () => {
  for (const m of ["a", "b", "c"] as const) {
    assert.ok(pageWidth(off(m), x) < pageWidth(on(m), x));
  }
});

test("available — маш өргөн дэлгэцэнд бүгд", () => {
  assert.equal(available(x, 4000, []).length, 12);
});

test("available — нарийн дэлгэцэнд зөвхөн анхдагч", () => {
  const narrow = pageWidth(off("a"), x) + HYSTERESIS - 1;
  const list = available(x, narrow, []);
  assert.equal(list.length, 1);
  assert.ok(same(list[0]!, DEFAULT_LAYOUT));
});

test("showsControl — сонголт ганц бол удирдлага гарахгүй", () => {
  assert.equal(showsControl([{ ...DEFAULT_LAYOUT }]), false);
  assert.equal(showsControl([{ ...DEFAULT_LAYOUT }, off("a")]), true);
});

test("clamp — боломжгүй сонголт анхдагч уруу шахагдана", () => {
  assert.ok(same(clamp(on("c"), [{ ...DEFAULT_LAYOUT }]), DEFAULT_LAYOUT));
  assert.ok(same(clamp(off("b"), [{ ...DEFAULT_LAYOUT }, off("b")]), off("b")));
  assert.ok(
    same(clamp(pv("a", true), [{ ...DEFAULT_LAYOUT }]), DEFAULT_LAYOUT),
  );
});

test("clamp — desired устахгүй (цонх өргөсөхөд буцаж ирнэ)", () => {
  const desired = on("c");
  assert.ok(same(clamp(desired, available(x, 900, [])), DEFAULT_LAYOUT));
  assert.ok(same(clamp(desired, available(x, 2000, [])), desired));
});

test("хадгалалт — гүйлгээ гүйцэд", () => {
  for (const l of ALL_LAYOUTS) {
    assert.ok(same(parseLayout(serializeLayout(l)), l));
  }
});

test("parseLayout — хог утгыг анхдагч болгоно", () => {
  for (const v of ["", "z--", "a", "a*-", "abcd", null, undefined, 3]) {
    assert.ok(same(parseLayout(v), DEFAULT_LAYOUT));
  }
});
