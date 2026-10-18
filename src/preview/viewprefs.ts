import { KEYS, read, remove, write } from "../store.ts";

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

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

export function loadZoom(): number {
  const value = Number(read(KEYS.pdfZoom));
  return value > 0 ? clampZoom(value) : 1;
}

export function saveZoom(zoom: number): void {
  if (zoom === 1) remove(KEYS.pdfZoom);
  else write(KEYS.pdfZoom, String(zoom));
}

export function loadInvert(): boolean {
  return read(KEYS.pdfInvert) !== "off";
}

export function saveInvert(on: boolean): void {
  write(KEYS.pdfInvert, on ? "on" : "off");
}
