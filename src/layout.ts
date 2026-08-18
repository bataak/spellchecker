export type Measure = "a" | "b" | "c";

export const MEASURES: Readonly<Record<Measure, number>> = {
  a: 75,
  b: 80,
  c: 100,
};

export const MEASURE_ORDER: readonly Measure[] = ["a", "b", "c"];

export const PREVIEW_MEASURE = 80;

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
  per: 9.125,
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
  return MEASURES[m] * x.per * x.scale + 2 * x.padX + x.gutterW;
}

export function previewWidth(l: Layout, x: Metrics): number {
  if (!l.preview) return 0;
  return PREVIEW_MEASURE * x.per * x.scale + 2 * x.previewPad;
}

export function contentWidth(l: Layout, x: Metrics): number {
  let w = editorWidth(l.measure, x);
  if (l.preview) w += previewWidth(l, x) + x.panelGap;
  if (l.panel) w += x.panelW + x.panelGap;
  return w;
}

export function pageWidth(l: Layout, x: Metrics): number {
  return contentWidth(l, x) + 2 * x.pagePad - x.gutterW;
}

export function rowKey(l: Layout): string {
  return `${l.panel ? "p" : "-"}${l.preview ? "v" : "-"}`;
}

export function fits(
  l: Layout,
  x: Metrics,
  viewport: number,
  active = false,
): boolean {
  if (same(l, DEFAULT_LAYOUT)) return true;
  return viewport >= pageWidth(l, x) + (active ? 0 : HYSTERESIS);
}

export function available(
  x: Metrics,
  viewport: number,
  prev: readonly Layout[] = [],
): Layout[] {
  return ALL_LAYOUTS.filter((l) => fits(l, x, viewport, has(prev, l)));
}

export function clamp(desired: Layout, avail: readonly Layout[]): Layout {
  return has(avail, desired) ? desired : { ...DEFAULT_LAYOUT };
}

export function showsControl(avail: readonly Layout[]): boolean {
  return avail.length > 1;
}

export function isMeasure(v: unknown): v is Measure {
  return v === "a" || v === "b" || v === "c";
}

export function parseLayout(v: unknown): Layout {
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
