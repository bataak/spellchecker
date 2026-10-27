export type Measure = "a" | "b" | "c";

export const MEASURES: Readonly<Record<Measure, number>> = {
  a: 75,
  b: 80,
  c: 100,
};

export const MEASURE_ORDER: readonly Measure[] = ["a", "b", "c"];

export const PREVIEW_MEASURE = 80;
export const PREVIEW_MIN_MEASURE = 60;

export interface Layout {
  measure: Measure;
  panel: boolean;
  preview: boolean;
}

export const DEFAULT_LAYOUT: Readonly<Layout> = {
  measure: "a",
  panel: true,
  preview: false,
};

export const INITIAL_LAYOUT: Readonly<Layout> = {
  measure: "b",
  panel: true,
  preview: false,
};

const ROW_ORDER: readonly Pick<Layout, "panel" | "preview">[] = [
  { panel: true, preview: false },
  { panel: false, preview: false },
  { panel: false, preview: true },
  { panel: true, preview: true },
];

export const ALL_LAYOUTS: readonly Layout[] = ROW_ORDER.flatMap(
  ({ panel, preview }) =>
    MEASURE_ORDER.map((measure) => ({ measure, panel, preview })),
);

export const HYSTERESIS = 40;

export interface Metrics {
  per: number;
  scale: number;
  padX: number;
  gutterW: number;
  panelW: number;
  previewPad: number;
  panelGap: number;
  pagePad: number;
}

export const DEFAULT_METRICS: Readonly<Metrics> = {
  per: 9.149,
  scale: 1,
  padX: 22,
  gutterW: 42,
  panelW: 358,
  previewPad: 20,
  panelGap: 14,
  pagePad: 20,
};

export function key(l: Layout): string {
  return `${l.measure}${l.panel ? "p" : "-"}${l.preview ? "v" : "-"}`;
}

export function same(a: Layout, b: Layout): boolean {
  return (
    a.measure === b.measure && a.panel === b.panel && a.preview === b.preview
  );
}

export function has(list: readonly Layout[], l: Layout): boolean {
  return list.some((x) => same(x, l));
}

export function editorWidth(m: Measure, x: Metrics): number {
  return MEASURES[m] * x.per + 2 * x.padX + x.gutterW;
}

export function previewWidth(
  l: Layout,
  x: Metrics,
  measure = PREVIEW_MEASURE,
): number {
  if (!l.preview) return 0;
  return measure * x.per + 2 * x.previewPad;
}

export function contentWidth(
  l: Layout,
  x: Metrics,
  measure = PREVIEW_MEASURE,
): number {
  let w = editorWidth(l.measure, x);
  if (l.preview) w += previewWidth(l, x, measure) + x.panelGap;
  if (l.panel) w += x.panelW + x.panelGap;
  return w;
}

export function pageWidth(
  l: Layout,
  x: Metrics,
  measure = PREVIEW_MEASURE,
): number {
  return contentWidth(l, x, measure) + 2 * x.pagePad - x.gutterW;
}

export function previewMeasure(
  l: Layout,
  x: Metrics,
  viewport: number,
): number {
  if (!l.preview) return PREVIEW_MEASURE;
  const spare = viewport - pageWidth(l, x, PREVIEW_MIN_MEASURE);
  const extra = Math.max(0, Math.floor(spare / x.per));
  return Math.min(PREVIEW_MEASURE, PREVIEW_MIN_MEASURE + extra);
}

export function rowKey(l: Layout): string {
  return `${l.panel ? "p" : "-"}${l.preview ? "v" : "-"}`;
}

export function fits(
  l: Layout,
  x: Metrics,
  viewport: number,
  active = false,
  measure = PREVIEW_MEASURE,
): boolean {
  if (same(l, DEFAULT_LAYOUT)) return true;
  return viewport >= pageWidth(l, x, measure) + (active ? 0 : HYSTERESIS);
}

export function available(
  x: Metrics,
  viewport: number,
  prev: readonly Layout[] = [],
): Layout[] {
  const at = (l: Layout, measure: number): boolean =>
    fits(l, x, viewport, has(prev, l), measure);
  const full = ALL_LAYOUTS.filter((l) => at(l, PREVIEW_MEASURE));
  if (!full.some((l) => l.preview))
    return ALL_LAYOUTS.filter((l) => at(l, PREVIEW_MIN_MEASURE));
  return ALL_LAYOUTS.filter(
    (l) =>
      has(full, l) || (l.preview && !l.panel && at(l, PREVIEW_MIN_MEASURE)),
  );
}

export function clamp(desired: Layout, avail: readonly Layout[]): Layout {
  return has(avail, desired) ? desired : { ...DEFAULT_LAYOUT };
}

export function previewLayout(
  current: Layout,
  avail: readonly Layout[],
): Layout | null {
  for (const panel of [true, false]) {
    const row = avail.filter((l) => l.preview && l.panel === panel);
    if (row.length === 0) continue;
    return (
      row.find((l) => l.measure === current.measure) ?? row[row.length - 1]!
    );
  }
  return null;
}

export function showsControl(avail: readonly Layout[]): boolean {
  return avail.length > 1;
}

export function isMeasure(v: unknown): v is Measure {
  return v === "a" || v === "b" || v === "c";
}

export function parseLayout(v: unknown): Layout {
  if (v === null || v === undefined) return { ...INITIAL_LAYOUT };
  if (typeof v !== "string" || v.length !== 3) return { ...DEFAULT_LAYOUT };
  const [m, p, r] = v;
  if (!isMeasure(m)) return { ...DEFAULT_LAYOUT };
  if (p !== "p" && p !== "-") return { ...DEFAULT_LAYOUT };
  if (r !== "v" && r !== "-") return { ...DEFAULT_LAYOUT };
  return { measure: m, panel: p === "p", preview: r === "v" };
}

export function serializeLayout(l: Layout): string {
  return key(l);
}

export type DockPlace = "panel-top" | "panel" | "left" | "right";

export function parseDock(v: unknown): DockPlace | null {
  return v === "panel-top" || v === "panel" || v === "left" || v === "right"
    ? v
    : null;
}

export function dockColumnFits(
  l: Layout,
  x: Metrics,
  viewport: number,
  side: "left" | "right",
  active = false,
): boolean {
  const extra = x.panelW + x.panelGap + (side === "left" ? x.gutterW : 0);
  return viewport >= pageWidth(l, x) + extra + (active ? 0 : HYSTERESIS);
}

export function resolveDock(
  desired: DockPlace | null,
  panelShown: boolean,
  room: boolean,
): DockPlace | null {
  if (!desired) return null;
  if (desired === "panel" || desired === "panel-top")
    return panelShown ? desired : null;
  if (room) return desired;
  return panelShown ? "panel" : null;
}

export interface LayoutChoice {
  readonly avail: Layout[];
  readonly active: Layout;
}

export function chooseLayout(
  fit: Layout[],
  desired: Layout,
  previewBlocked: boolean,
  previewMode: boolean,
): LayoutChoice {
  const avail = previewBlocked ? fit.filter((l) => !l.preview) : fit;
  const base = clamp(
    previewBlocked ? { ...desired, preview: false } : desired,
    avail,
  );
  return {
    avail,
    active: (previewMode && previewLayout(base, avail)) || base,
  };
}

export function projectViewport(
  full: number,
  room: number,
  loose: number,
): { viewport: number; float: boolean } {
  const float = full - room < loose;
  return { viewport: float ? full : full - room, float };
}

export interface TalkPlan {
  readonly mode: "column" | "swap" | "float";
  readonly width: number;
  readonly viewport: number;
}

export function talkPlan(
  x: Metrics,
  full: number,
  page: { readonly loose: number; readonly tight: number },
  project: number,
  minWidth: number,
): TalkPlan {
  const fit = (taken: number, edge: number): number | null => {
    const spare = (width: number): number =>
      full - taken - width - x.panelGap - edge;
    if (spare(page.loose) >= minWidth)
      return Math.min(x.panelW, spare(page.loose));
    return spare(page.tight) >= minWidth ? minWidth : null;
  };
  const edge = project > 0 ? 0 : x.gutterW;
  const beside = fit(project, edge);
  if (beside !== null)
    return {
      mode: "column",
      width: beside,
      viewport: full - project - beside - x.panelGap - edge,
    };
  if (project > 0) {
    const width = fit(0, x.gutterW) ?? minWidth;
    return {
      mode: "swap",
      width,
      viewport: full - width - x.panelGap - x.gutterW,
    };
  }
  return { mode: "float", width: x.panelW, viewport: full };
}

export interface ThumbSpan {
  readonly x: number;
  readonly w: number;
  readonly part: "editor" | "preview" | "panel";
}

export function thumbSpans(
  l: Layout,
  x: Metrics,
  scale: number,
  gap: number,
): ThumbSpan[] {
  const spans: ThumbSpan[] = [
    { x: 0, w: editorWidth(l.measure, x) * scale, part: "editor" },
  ];
  const push = (w: number, part: ThumbSpan["part"]): void => {
    const last = spans[spans.length - 1]!;
    spans.push({ x: last.x + last.w + gap, w, part });
  };
  if (l.preview) push(previewWidth(l, x) * scale, "preview");
  if (l.panel) push(x.panelW * scale, "panel");
  return spans;
}

export function describeLayout(l: Layout): string {
  const n = Math.round(MEASURES[l.measure]);
  const parts = [`бичвэрийн талбар (${n} тэмдэгт)`];
  if (l.preview) parts.push("харагдац");
  if (l.panel) parts.push("алдааны талбар");
  return parts.join(" + ");
}
