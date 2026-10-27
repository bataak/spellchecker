import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_LAYOUTS,
  DEFAULT_LAYOUT,
  INITIAL_LAYOUT,
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
  previewLayout,
  same,
  serializeLayout,
  showsControl,
  dockColumnFits,
  parseDock,
  resolveDock,
  type Layout,
  type Metrics,
  chooseLayout,
  describeLayout,
  projectViewport,
  talkPlan,
  thumbSpans,
  PREVIEW_MIN_MEASURE,
  previewMeasure,
} from "../src/ui/layout.ts";

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
    const want = PREVIEW_MEASURE * x.per + 2 * x.previewPad;
    near(previewWidth(pv(m, false), x), want);
    assert.equal(previewWidth(off(m), x), 0);
    near(pageWidth(pv(m, false), x) - pageWidth(off(m), x), want + x.panelGap);
  }
});

test("харагдац ердийн дэлгэцэд хүрнэ", () => {
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

test("preview + хавтас нь аль алиных нь зайг эзэлнэ", () => {
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

test("editorWidth — --editor-scale-аас хамаарахгүй", () => {
  const big = { ...x, scale: 1.25 };
  const small = { ...x, scale: 0.8 };
  for (const m of ["a", "b", "c"] as const) {
    near(editorWidth(m, big), editorWidth(m, x), m);
    near(editorWidth(m, small), editorWidth(m, x), m);
  }
});

test("previewWidth — --editor-scale-аас хамаарахгүй", () => {
  const big = { ...x, scale: 1.25 };
  for (const m of ["a", "b", "c"] as const) {
    near(previewWidth(pv(m, false), big), previewWidth(pv(m, false), x), m);
  }
});

test("available — font scale байрлалын сонголтыг өөрчлөхгүй", () => {
  for (const scale of [0.8, 1.25, 1.5]) {
    const s = { ...x, scale };
    for (const vw of [800, 1280, 1440, 1606, 1920, 2560]) {
      assert.deepEqual(
        available(s, vw, []).map(key),
        available(x, vw, []).map(key),
        `scale=${scale} vw=${vw}`,
      );
    }
  }
});

test("clamp — font томруулахад сонгосон байрлал хадгалагдана", () => {
  const desired = on("c");
  const prev = available(x, 1920, []);
  assert.ok(same(clamp(desired, prev), desired));
  const big = { ...x, scale: 1.25 };
  assert.ok(same(clamp(desired, available(big, 1920, prev)), desired));
});

test("editorWidth — gutter байхгүй үед богиносно", () => {
  near(editorWidth("a", { ...x, gutterW: 0 }), editorWidth("a", x) - x.gutterW);
});

test("pageWidth — хавтас нуухад зай чөлөөлөгдөнө", () => {
  for (const m of ["a", "b", "c"] as const) {
    near(pageWidth(on(m), x) - pageWidth(off(m), x), x.panelW + x.panelGap);
  }
});

test("pageWidth — c + хавтас нь 1606px дэлгэцэд багтана", () => {
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

test("available — маш өргөн дэлгэцэд бүгд", () => {
  assert.equal(available(x, 4000, []).length, 12);
});

test("available — нарийн дэлгэцэд зөвхөн анхдагч", () => {
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
  for (const v of ["", "z--", "a", "a*-", "abcd", 3]) {
    assert.ok(same(parseLayout(v), DEFAULT_LAYOUT));
  }
});

test("parseLayout — хадгалсан утгагүй бол анх 80 өргөнөөр нээнэ", () => {
  for (const v of [null, undefined]) {
    assert.ok(same(parseLayout(v), INITIAL_LAYOUT));
  }
  assert.equal(MEASURES[INITIAL_LAYOUT.measure], 80);
  assert.equal(INITIAL_LAYOUT.panel, true);
});

test("previewLayout — багтвал харагдац + алдааны талбар, одоогийн өргөнөөр", () => {
  assert.deepEqual(previewLayout(on("b"), ALL_LAYOUTS), pv("b", true));
});

test("previewLayout — алдааны талбар багтахгүй бол зөвхөн харагдац", () => {
  const avail = [on("a"), off("a"), pv("a", false), pv("b", false)];
  assert.deepEqual(previewLayout(on("c"), avail), pv("b", false));
});

test("previewLayout — харагдац багтахгүй бол null", () => {
  assert.equal(previewLayout(DEFAULT_LAYOUT, [on("a"), off("a")]), null);
});

test("previewLayout — бодит өргөнөөс хамаарна", () => {
  const narrow = available(x, pageWidth(pv("a", false), x) + HYSTERESIS);
  assert.deepEqual(previewLayout(DEFAULT_LAYOUT, narrow), pv("a", false));
  const wide = available(x, pageWidth(pv("c", true), x) + HYSTERESIS);
  assert.deepEqual(previewLayout(DEFAULT_LAYOUT, wide), pv("a", true));
  assert.equal(previewLayout(DEFAULT_LAYOUT, available(x, 400)), null);
});

test("parseDock зөвхөн мэдэгдэх байршлыг хүлээн авна", () => {
  assert.equal(parseDock("left"), "left");
  assert.equal(parseDock("panel"), "panel");
  assert.equal(parseDock("panel-top"), "panel-top");
  assert.equal(parseDock("top"), null);
  assert.equal(parseDock(null), null);
});

test("dockColumnFits нэмэлт баганын өргөнийг тооцно", () => {
  const l = on("a");
  const right = pageWidth(l, x) + x.panelW + x.panelGap;
  assert.equal(dockColumnFits(l, x, right, "right", true), true);
  assert.equal(dockColumnFits(l, x, right - 1, "right", true), false);
  assert.equal(dockColumnFits(l, x, right, "right"), false);
  assert.equal(dockColumnFits(l, x, right + HYSTERESIS, "right"), true);
  assert.equal(dockColumnFits(l, x, right, "left", true), false);
  assert.equal(dockColumnFits(l, x, right + x.gutterW, "left", true), true);
});

test("resolveDock багтахгүй баганыг алдааны талбар уруу шилжүүлнэ", () => {
  assert.equal(resolveDock(null, true, true), null);
  assert.equal(resolveDock("left", true, true), "left");
  assert.equal(resolveDock("right", true, false), "panel");
  assert.equal(resolveDock("right", false, false), null);
  assert.equal(resolveDock("panel", true, false), "panel");
  assert.equal(resolveDock("panel", false, true), null);
  assert.equal(resolveDock("panel-top", true, false), "panel-top");
  assert.equal(resolveDock("panel-top", false, true), null);
});

test("chooseLayout: харагдац хориглогдвол сонголтоос хасна", () => {
  const fit = available(DEFAULT_METRICS, 3000, []);
  const wanted = { measure: "b", panel: true, preview: true } as const;
  const open = chooseLayout(fit, wanted, false, false);
  assert.ok(open.avail.some((l) => l.preview));
  const blocked = chooseLayout(fit, wanted, true, false);
  assert.ok(blocked.avail.every((l) => !l.preview));
  assert.equal(blocked.active.preview, false);
});

test("projectViewport: багтахгүй бол самбар хөвөөд бүтэн өргөнийг өгнө", () => {
  assert.deepEqual(projectViewport(1600, 300, 1200), {
    viewport: 1300,
    float: false,
  });
  assert.deepEqual(projectViewport(1400, 300, 1200), {
    viewport: 1400,
    float: true,
  });
});

test("talkPlan: зай байвал 358 хүртэл сунаж, багадаа 236 хүртэл агшиж багана болно", () => {
  const edge = x.panelGap + x.gutterW;
  assert.deepEqual(talkPlan(x, 2000, 1200, 0, 236), {
    mode: "column",
    width: x.panelW,
    viewport: 2000 - x.panelW - edge,
  });
  const tight = talkPlan(x, 1500, 1200, 0, 236);
  assert.equal(tight.mode, "column");
  assert.equal(tight.width, 1500 - 1200 - edge);
  assert.equal(tight.viewport, 1200);
  assert.equal(talkPlan(x, 1400, 1200, 0, 236).mode, "float");
});

test("talkPlan: төслийн самбартай багтахгүй бол түүний байрыг эзэлж, бас багтахгүй бол хөвнө", () => {
  const project = 236 + x.panelGap + x.gutterW;
  const beside = talkPlan(x, 2200, 1200, project, 236);
  assert.equal(beside.mode, "column");
  assert.equal(beside.width, x.panelW);
  const swap = talkPlan(x, 1500, 1200, project, 236);
  assert.equal(swap.mode, "swap");
  assert.equal(swap.width, 1500 - 1200 - x.panelGap - x.gutterW);
  assert.equal(swap.viewport, 1200);
  const roomy = talkPlan(x, 1700, 1200, project, 236);
  assert.equal(roomy.mode, "swap");
  assert.equal(roomy.width, x.panelW);
  assert.deepEqual(talkPlan(x, 1300, 1200, 0, 236), {
    mode: "float",
    width: x.panelW,
    viewport: 1300,
  });
});

test("thumbSpans: хэсгүүдийг завсартай дараалуулна", () => {
  const spans = thumbSpans(
    { measure: "a", panel: true, preview: true },
    DEFAULT_METRICS,
    0.1,
    4,
  );
  assert.deepEqual(
    spans.map((span) => span.part),
    ["editor", "preview", "panel"],
  );
  assert.equal(spans[1]!.x, spans[0]!.w + 4);
  assert.equal(spans[2]!.x, spans[1]!.x + spans[1]!.w + 4);
  assert.equal(
    thumbSpans(DEFAULT_LAYOUT, DEFAULT_METRICS, 1, 4).length,
    1 + Number(DEFAULT_LAYOUT.preview) + Number(DEFAULT_LAYOUT.panel),
  );
});

test("describeLayout: тэмдэгтийн тоо ба нэмэлт талбаруудыг нэрлэнэ", () => {
  assert.equal(
    describeLayout({ measure: "b", panel: true, preview: true }),
    "бичвэрийн талбар (" +
      Math.round(MEASURES.b) +
      " тэмдэгт) + харагдац + алдааны талбар",
  );
});

test("previewMeasure: багтвал 80, давчуу үед 60 хүртэл нарийсна", () => {
  const view = { measure: "a", panel: false, preview: true } as const;
  const full = pageWidth(view, x);
  const tight = pageWidth(view, x, PREVIEW_MIN_MEASURE);
  assert.equal(previewMeasure(view, x, full + 500), PREVIEW_MEASURE);
  assert.equal(previewMeasure(view, x, full), PREVIEW_MEASURE);
  assert.equal(previewMeasure(view, x, tight), PREVIEW_MIN_MEASURE);
  const mid = previewMeasure(view, x, tight + 10 * x.per);
  assert.equal(mid, PREVIEW_MIN_MEASURE + 10);
  assert.equal(previewMeasure(DEFAULT_LAYOUT, x, 300), PREVIEW_MEASURE);
});

test("available: 14 инчийн дэлгэцэд хажуу байрлал гарч ирнэ", () => {
  const keys = (w: number) =>
    available(x, w, [])
      .filter((l) => l.preview)
      .map(key);
  assert.deepEqual(keys(1366), []);
  assert.ok(keys(1440).includes("a-v"));
  assert.ok(keys(1536).includes("a-v"));
  assert.ok(keys(1920).includes("a-v"));
});

test("available: 80 тэмдэгтийн preview багтвал хуучин дүрмээр сонгоно", () => {
  for (const w of [1600, 1700, 1920, 2200, 2800]) {
    const strict = ALL_LAYOUTS.filter((l) => fits(l, x, w));
    if (strict.some((l) => l.preview))
      assert.deepEqual(
        available(x, w, []).map(key),
        strict.map(key),
        String(w),
      );
  }
  const narrow = available(x, 1440, []);
  assert.ok(narrow.every((l) => fits(l, x, 1440, false, PREVIEW_MIN_MEASURE)));
});
