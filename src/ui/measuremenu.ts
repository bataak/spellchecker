import {
  ALL_LAYOUTS,
  DEFAULT_LAYOUT,
  contentWidth,
  describeLayout,
  has,
  key,
  rowKey,
  same,
  thumbSpans,
  type Layout,
  type Metrics,
} from "./layout.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

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
  const spans = thumbSpans(l, x, THUMB_W / Math.max(widest, 1), THUMB_GAP);
  const last = spans[spans.length - 1]!;
  const boxW = last.x + last.w;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${boxW.toFixed(2)} ${THUMB_H}`);
  svg.setAttribute("width", boxW.toFixed(2));
  svg.setAttribute("height", String(THUMB_H));
  svg.setAttribute("class", "measure-thumb");
  svg.setAttribute("aria-hidden", "true");
  for (const span of spans)
    rect(svg, span.x, span.w, "measure-thumb-" + span.part);
  return svg;
}

export interface Control {
  readonly ctl: HTMLElement;
  readonly btn: HTMLButtonElement;
  readonly menu: HTMLElement;
  readonly tools: HTMLElement;
}

export function buildControl(wrap: HTMLElement): Control {
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
  for (const el of wrap.querySelectorAll<HTMLElement>(".decode-btn"))
    tools.append(el);
  tools.append(ctl);
  wrap.append(tools);
  btn.classList.add("is-shown");
  setTimeout(() => {
    btn.classList.remove("is-shown");
  }, 5000);
  return { ctl, btn, menu, tools };
}

function layoutRows(): Layout[][] {
  const rows = new Map<string, Layout[]>();
  for (const l of ALL_LAYOUTS) {
    const k = rowKey(l);
    const row = rows.get(k);
    if (row) row.push(l);
    else rows.set(k, [l]);
  }
  return [...rows.values()];
}

function layoutOption(
  l: Layout,
  active: Layout,
  ok: boolean,
  art: SVGSVGElement,
  pick: (l: Layout) => void,
): HTMLButtonElement {
  const opt = document.createElement("button");
  opt.type = "button";
  opt.className = "measure-opt";
  opt.dataset.layout = key(l);
  opt.setAttribute("role", "menuitemradio");
  opt.setAttribute("aria-checked", String(same(l, active)));
  opt.setAttribute("aria-label", describeLayout(l));
  if (same(l, DEFAULT_LAYOUT)) opt.dataset.default = "true";
  opt.disabled = !ok;
  opt.title = describeLayout(l);
  opt.append(art);
  if (ok) opt.addEventListener("click", () => pick(l));
  return opt;
}

export function paintMenu(
  { btn, menu }: Control,
  avail: readonly Layout[],
  active: Layout,
  metrics: Metrics,
  pick: (l: Layout) => void,
): void {
  const widest = Math.max(
    ...ALL_LAYOUTS.map((l) => contentWidth(l, metrics)),
    1,
  );
  btn.setAttribute("aria-label", `Байрлал: ${describeLayout(active)}`);
  btn.title = describeLayout(active);
  menu.replaceChildren();
  for (const row of layoutRows()) {
    const line = document.createElement("div");
    line.className = "measure-row";
    for (const l of row)
      line.append(
        layoutOption(l, active, has(avail, l), thumb(l, metrics, widest), pick),
      );
    menu.append(line);
  }
}

export function bindMenu(control: Control, close: () => void): () => void {
  const { ctl, btn, menu } = control;
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
  return () => {
    document.removeEventListener("pointerdown", onDocPointer);
    document.removeEventListener("keydown", onKey);
  };
}
