import { KEYS, read, remove, write } from "../core/store.ts";

const ZOOM_STEPS = [
  0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6,
];

export const ZOOM_MIN = ZOOM_STEPS[0]!;
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

export function clampZoom(zoom: number): number {
  return Math.min(Math.max(Math.round(zoom * 1000) / 1000, ZOOM_MIN), ZOOM_MAX);
}

export function stepZoom(zoom: number, dir: number): number {
  const next =
    dir > 0
      ? ZOOM_STEPS.find((step) => step > zoom + 0.001)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001);
  return next ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN);
}

export function wheelZoom(
  zoom: number,
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
): number {
  const notch =
    event.deltaMode !== 0 ||
    (Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY));
  if (notch) return stepZoom(zoom, event.deltaY < 0 ? 1 : -1);
  const delta = Math.max(Math.min(event.deltaY, 50), -50);
  return clampZoom(zoom * Math.exp(-delta / 100));
}

export interface TouchPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export function touchSpan(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function touchMid(
  a: TouchPoint,
  b: TouchPoint,
): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

export function pinchZoom(zoom: number, from: number, to: number): number {
  return from > 0 ? clampZoom((zoom * to) / from) : zoom;
}

export const TOUCH_CANVAS_PIXELS = 12_000_000;
export const DESKTOP_CANVAS_PIXELS = 32_000_000;

export function canvasDensity(
  width: number,
  aspect: number,
  dpr: number,
  maxPixels: number,
): number {
  const area = width * width * aspect;
  return area > 0 ? Math.min(dpr, Math.sqrt(maxPixels / area)) : dpr;
}

export function loadZoom(): number {
  const value = Number(read(KEYS.pdfZoom));
  return value > 0 ? clampZoom(value) : 1;
}

export function saveZoom(zoom: number): void {
  if (zoom === 1) remove(KEYS.pdfZoom);
  else write(KEYS.pdfZoom, String(zoom));
}

export function scrollRatio(left: number, range: number): number | null {
  return range > 0 ? Math.min(Math.max(left / range, 0), 1) : null;
}

export function loadScrollX(): number | null {
  const value = read(KEYS.pdfScrollX);
  if (value === null) return null;
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : null;
}

export function saveScrollX(ratio: number): void {
  write(KEYS.pdfScrollX, String(Math.round(ratio * 10000) / 10000));
}

export function loadInvert(): boolean {
  return read(KEYS.pdfInvert) !== "off";
}

export function saveInvert(on: boolean): void {
  write(KEYS.pdfInvert, on ? "on" : "off");
}
