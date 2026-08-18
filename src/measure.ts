import {
  ALL_LAYOUTS,
  DEFAULT_LAYOUT,
  DEFAULT_METRICS,
  MEASURES,
  available,
  clamp,
  contentWidth,
  editorWidth,
  key,
  parseLayout,
  previewWidth,
  rowKey,
  has,
  same,
  serializeLayout,
  showsControl,
  type Layout,
  type Metrics,
} from "./layout.ts";

const STORAGE_KEY = "layout";

const SAMPLE =
  "Монгол хэлний үг залгамжлалт бүтэцтэй тул нэлээд урт болдог, " +
  "үүнээс шалтгаалж мөрийн төгсгөлийн үлдэгдэл зай ихэсдэг. " +
  "Тэгэхээр нэг тэмдэгтийн дундаж өргөнийг бодит бичвэрээр хэмжинэ.";

const SVG_NS = "http://www.w3.org/2000/svg";

function px(cs: CSSStyleDeclaration, prop: string, fallback: number): number {
  const v = Number.parseFloat(cs.getPropertyValue(prop));
  return Number.isFinite(v) ? v : fallback;
}

function measureVar(host: HTMLElement, name: string, fallback: number): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    `position:absolute;visibility:hidden;pointer-events:none;` +
    `height:0;padding:0;border:0;width:var(${name})`;
  host.append(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(w) && w >= 0 ? w : fallback;
}

function measurePer(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return DEFAULT_METRICS.per;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = ctx.measureText(SAMPLE).width;
  if (!(w > 0)) return DEFAULT_METRICS.per;
  const ls = Number.parseFloat(cs.letterSpacing);
  return w / SAMPLE.length + (Number.isFinite(ls) ? ls : 0);
}

function normalizePer(raw: number, scale: number): number {
  return scale > 0 ? raw / scale : raw;
}

function toolbarNeed(bar: HTMLElement): number {
  const cs = getComputedStyle(bar);
  const gap = Number.parseFloat(cs.columnGap) || 0;
  let w =
    (Number.parseFloat(cs.paddingLeft) || 0) +
    (Number.parseFloat(cs.paddingRight) || 0);
  let count = 0;
  for (const el of bar.children) {
    const e = el as HTMLElement;
    if (e.hidden || e.offsetParent === null) continue;
    w += e.getBoundingClientRect().width;
    count += 1;
  }
  return w + Math.max(count - 1, 0) * gap;
}

function syncToolbar(): void {
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const host = bar?.parentElement;
  if (!bar || !host) return;
  const room = host.getBoundingClientRect().width;
  const wide = toolbarNeed(bar) > room + 0.5;
  if (wide) document.documentElement.dataset.toolbar = "wide";
  else delete document.documentElement.dataset.toolbar;
}

let scrollbarWidth: number | null = null;

function measureScrollbar(): number {
  if (scrollbarWidth !== null) return scrollbarWidth;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;" +
    "width:100px;height:100px;overflow:scroll";
  document.body.append(probe);
  scrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return scrollbarWidth;
}

function readMetrics(area: HTMLElement, wrap: HTMLElement): Metrics {
  const root = getComputedStyle(document.documentElement);
  const areaCs = getComputedStyle(area);
  const scale = px(root, "--editor-scale", DEFAULT_METRICS.scale);
  const main = wrap.closest<HTMLElement>("main");
  return {
    per: normalizePer(measurePer(area), scale),
    scale,
    padX: Number.parseFloat(areaCs.paddingLeft) || DEFAULT_METRICS.padX,
    pagePad: main
      ? Number.parseFloat(getComputedStyle(main).paddingLeft) ||
        DEFAULT_METRICS.pagePad
      : DEFAULT_METRICS.pagePad,
    gutterW: measureVar(wrap, "--gutter-w", DEFAULT_METRICS.gutterW),
    panelW: DEFAULT_METRICS.panelW,
    previewPad: DEFAULT_METRICS.previewPad,
    panelGap: DEFAULT_METRICS.panelGap,
  };
}

function load(): Layout {
  try {
    return parseLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function save(l: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeLayout(l));
  } catch {}
}

function rect(svg: SVGSVGElement, x: number, w: number, cls: string): void {
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("x", (x + 1).toFixed(2));
  r.setAttribute("y", "1");
  r.setAttribute("width", Math.max(w - 2, 2).toFixed(2));
  r.setAttribute("height", String(THUMB_H - 2));
  r.setAttribute("rx", "3");
  r.setAttribute("class", cls);
  svg.append(r);
}

function glyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 18 14");
  svg.setAttribute("class", "measure-glyph");
  svg.setAttribute("aria-hidden", "true");

  const frame = document.createElementNS(SVG_NS, "rect");
  frame.setAttribute("x", "1");
  frame.setAttribute("y", "1");
  frame.setAttribute("width", "16");
  frame.setAttribute("height", "12");
  frame.setAttribute("rx", "2.25");
  frame.setAttribute("class", "measure-glyph-frame");
  svg.append(frame);

  const slot = document.createElementNS(SVG_NS, "rect");
  slot.setAttribute("x", "3.25");
  slot.setAttribute("y", "3.25");
  slot.setAttribute("width", "5.25");
  slot.setAttribute("height", "7.5");
  slot.setAttribute("rx", "1.15");
  slot.setAttribute("class", "measure-glyph-slot");
  svg.append(slot);

  return svg;
}

const THUMB_GAP = 4;
const THUMB_H = 30;
const THUMB_W = 96;

function thumb(l: Layout, x: Metrics, widest: number): SVGSVGElement {
  const scale = THUMB_W / Math.max(widest, 1);
  const ed = editorWidth(l.measure, x) * scale;
  const pv = previewWidth(l, x) * scale;
  const pn = l.panel ? x.panelW * scale : 0;

  const slots = 1 + (l.preview ? 1 : 0) + (l.panel ? 1 : 0);
  const total = ed + pv + pn + (slots - 1) * THUMB_GAP;

  const boxW = total;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${boxW.toFixed(2)} ${THUMB_H}`);
  svg.setAttribute("width", boxW.toFixed(2));
  svg.setAttribute("height", String(THUMB_H));
  svg.setAttribute("class", "measure-thumb");
  svg.setAttribute("aria-hidden", "true");

  let at = 0;
  rect(svg, at, ed, "measure-thumb-editor");
  at += ed;
  if (l.preview) {
    at += THUMB_GAP;
    rect(svg, at, pv, "measure-thumb-preview");
    at += pv;
  }
  if (l.panel) {
    at += THUMB_GAP;
    rect(svg, at, pn, "measure-thumb-panel");
  }
  return svg;
}

function describe(l: Layout): string {
  const n = Math.round(MEASURES[l.measure]);
  const parts = [`бичвэрийн талбар (${n} тэмдэгт)`];
  if (l.preview) parts.push("харагдац");
  if (l.panel) parts.push("алдааны талбар");
  return parts.join(" + ");
}

export interface MeasureControl {
  refresh(): void;
  destroy(): void;
}

export function mountMeasureControl(
  wrap: HTMLElement,
  area: HTMLElement,
  onChange?: (l: Layout) => void,
): MeasureControl {
  const ctl = document.createElement("div");
  ctl.className = "measure-ctl";
  ctl.hidden = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "measure-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.title = "Байрлал";
  btn.append(glyph());

  const menu = document.createElement("div");
  menu.className = "measure-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  ctl.append(btn, menu);

  const tools = document.createElement("div");
  tools.className = "editor-tools";
  for (const el of wrap.querySelectorAll<HTMLElement>(".decode-btn")) {
    tools.append(el);
  }
  tools.append(ctl);
  wrap.append(tools);

  let desired: Layout = load();
  let prev: Layout[] = [];
  let metrics: Metrics = { ...DEFAULT_METRICS };

  const apply = (l: Layout): void => {
    const root = document.documentElement;
    if (l.measure === "a") delete root.dataset.measure;
    else root.dataset.measure = l.measure;
    if (l.panel) delete root.dataset.panel;
    else root.dataset.panel = "off";
    if (l.preview) root.dataset.preview = "on";
    else delete root.dataset.preview;
    onChange?.(l);
  };

  const close = (): void => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };

  const pick = (l: Layout): void => {
    desired = l;
    save(l);
    close();
    refresh();
    btn.focus();
  };

  const paint = (avail: readonly Layout[], active: Layout): void => {
    const rows = new Map<string, Layout[]>();
    for (const l of ALL_LAYOUTS) {
      const k = rowKey(l);
      const row = rows.get(k);
      if (row) row.push(l);
      else rows.set(k, [l]);
    }

    const widest = Math.max(
      ...ALL_LAYOUTS.map((l) => contentWidth(l, metrics)),
      1,
    );

    btn.setAttribute("aria-label", `Байрлал: ${describe(active)}`);
    btn.title = describe(active);

    menu.replaceChildren();
    for (const row of rows.values()) {
      const line = document.createElement("div");
      line.className = "measure-row";
      for (const l of row) {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "measure-opt";
        opt.dataset.layout = key(l);
        opt.setAttribute("role", "menuitemradio");
        opt.setAttribute("aria-checked", String(same(l, active)));
        opt.setAttribute("aria-label", describe(l));
        if (same(l, DEFAULT_LAYOUT)) opt.dataset.default = "true";

        const ok = has(avail, l);
        opt.disabled = !ok;
        opt.title = describe(l);
        opt.append(thumb(l, metrics, widest));
        if (ok) opt.addEventListener("click", () => pick(l));
        line.append(opt);
      }
      menu.append(line);
    }
  };

  function refresh(): void {
    metrics = readMetrics(area, wrap);
    document.documentElement.style.setProperty(
      "--editor-per",
      `${metrics.per.toFixed(3)}px`,
    );

    document.documentElement.style.setProperty(
      "--scrollbar-w",
      `${measureScrollbar()}px`,
    );

    const viewport = document.documentElement.clientWidth;
    const avail = available(metrics, viewport, prev);
    prev = avail;

    const active = clamp(desired, avail);
    apply(active);

    syncToolbar();

    const show = showsControl(avail);
    ctl.hidden = !show;
    if (!show) {
      close();
      return;
    }

    paint(avail, active);
  }

  btn.addEventListener("click", () => {
    if (menu.hidden) {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      menu.querySelector<HTMLButtonElement>(".measure-opt")?.focus();
    } else close();
  });

  const onDocPointer = (e: Event): void => {
    if (!menu.hidden && !ctl.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !menu.hidden) {
      close();
      btn.focus();
    }
  };
  document.addEventListener("pointerdown", onDocPointer);
  document.addEventListener("keydown", onKey);

  const ro = new ResizeObserver(() => refresh());
  ro.observe(document.documentElement);

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  void fonts?.ready.then(() => refresh());

  refresh();

  return {
    refresh,
    destroy() {
      ro.disconnect();
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
      for (const el of tools.querySelectorAll<HTMLElement>(".decode-btn")) {
        wrap.append(el);
      }
      tools.remove();
    },
  };
}
