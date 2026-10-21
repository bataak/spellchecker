import type { PDFDocumentProxy } from "pdfjs-dist";
import { canvasDensity } from "./viewprefs.ts";
import {
  covers,
  detailRect,
  snapShift,
  type Box,
  type DetailRect,
} from "./pdfdetail.ts";
import { noteError } from "../core/errorlog.ts";

const DETAIL_MARGIN = 0.25;

interface Detail {
  readonly canvas: HTMLCanvasElement;
  readonly rect: DetailRect;
  readonly width: number;
}

export interface PageSlot {
  el: HTMLElement;
  index: number;
  canvas: HTMLCanvasElement | null;
  task: { cancel: () => void } | null;
  rendering: boolean;
  gen: number;
  density: number;
  detail: Detail | null;
  detailTask: { cancel: () => void } | null;
  detailGen: number;
}

export function pageSlot(
  el: HTMLElement,
  index: number,
  dpr: number,
): PageSlot {
  return {
    el,
    index,
    canvas: null,
    task: null,
    rendering: false,
    gen: 0,
    density: dpr,
    detail: null,
    detailTask: null,
    detailGen: 0,
  };
}

export interface PaintCtx {
  readonly doc: PDFDocumentProxy;
  readonly host: HTMLElement;
  readonly base: { readonly width: number; readonly height: number };
  readonly dpr: number;
  readonly maxPixels: number;
  readonly painted: () => void;
}

export interface PagePainter {
  snap(slot: PageSlot): void;
  draw(slot: PageSlot): Promise<void>;
  drawDetail(slot: PageSlot): Promise<void>;
  cancelDetail(slot: PageSlot): void;
  invalidate(slot: PageSlot): void;
  release(slot: PageSlot): void;
}

function noteUnlessCancelled(error: unknown): void {
  if (error instanceof Error && error.name === "RenderingCancelledException")
    return;
  noteError(error);
}

function freeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function innerBox(el: HTMLElement): Box {
  const box = el.getBoundingClientRect();
  return {
    left: box.left + el.clientLeft,
    top: box.top + el.clientTop,
    width: el.clientWidth,
    height: el.clientHeight,
  };
}

const percent = (part: number, whole: number): string =>
  (part / whole) * 100 + "%";

function placeDetail(
  canvas: HTMLCanvasElement,
  rect: DetailRect,
  page: Box,
  dpr: number,
): void {
  canvas.className = "pdf-detail";
  canvas.width = Math.round(rect.w * dpr);
  canvas.height = Math.round(rect.h * dpr);
  canvas.style.left = percent(rect.x, page.width);
  canvas.style.top = percent(rect.y, page.height);
  canvas.style.width = percent(rect.w, page.width);
  canvas.style.height = percent(rect.h, page.height);
}

export function createPagePainter(c: PaintCtx): PagePainter {
  const { doc, base, dpr } = c;

  const snap = (slot: PageSlot): void => {
    if (!slot.canvas) return;
    const box = slot.el.getBoundingClientRect();
    const shift = snapShift(
      box.left + slot.el.clientLeft,
      box.top + slot.el.clientTop,
      dpr,
    );
    slot.canvas.style.transform = shift;
    if (slot.detail) slot.detail.canvas.style.transform = shift;
  };

  const cancelDetail = (slot: PageSlot): void => {
    slot.detailGen++;
    slot.detailTask?.cancel();
    slot.detailTask = null;
  };

  const dropDetail = (slot: PageSlot): void => {
    cancelDetail(slot);
    if (!slot.detail) return;
    slot.detail.canvas.remove();
    freeCanvas(slot.detail.canvas);
    slot.detail = null;
  };

  const invalidate = (slot: PageSlot): void => {
    slot.gen++;
    slot.task?.cancel();
    slot.task = null;
    slot.rendering = false;
    slot.canvas = null;
  };

  const release = (slot: PageSlot): void => {
    dropDetail(slot);
    if (slot.canvas) freeCanvas(slot.canvas);
    invalidate(slot);
    slot.el.replaceChildren();
  };

  const pageCanvas = (width: number, height: number, density: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width / density + "px";
    canvas.style.height = height / density + "px";
    return canvas;
  };

  const draw = async (slot: PageSlot): Promise<void> => {
    if (slot.canvas || slot.rendering) return;
    slot.rendering = true;
    const gen = ++slot.gen;
    try {
      const page = await doc.getPage(slot.index);
      const border = slot.el.clientLeft;
      const width = Math.max(
        slot.el.getBoundingClientRect().width - border * 2,
        120,
      );
      const ratio = base.height / base.width;
      const density = canvasDensity(width, ratio, dpr, c.maxPixels);
      const pixels = Math.round(width * density);
      const viewport = page.getViewport({ scale: pixels / base.width });
      const canvas = pageCanvas(pixels, Math.round(viewport.height), density);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render = page.render({ canvas, canvasContext: ctx, viewport });
      slot.task = render;
      await render.promise;
      if (gen !== slot.gen) return;
      slot.task = null;
      if (!slot.rendering) return;
      slot.density = density;
      if (density >= dpr) dropDetail(slot);
      slot.el.replaceChildren(canvas);
      if (slot.detail) slot.el.append(slot.detail.canvas);
      slot.canvas = canvas;
      snap(slot);
      page.cleanup();
      c.painted();
    } catch (error) {
      noteUnlessCancelled(error);
    } finally {
      if (gen === slot.gen) slot.rendering = false;
    }
  };

  const showDetail = (slot: PageSlot, detail: Detail): void => {
    const old = slot.detail;
    slot.el.append(detail.canvas);
    slot.detail = detail;
    if (old) {
      old.canvas.remove();
      freeCanvas(old.canvas);
    }
    snap(slot);
  };

  const drawDetail = async (slot: PageSlot): Promise<void> => {
    if (!slot.canvas || slot.rendering || slot.density >= dpr) return;
    const page = innerBox(slot.el);
    const view = innerBox(c.host);
    const need = detailRect(page, view, 0, dpr);
    if (!need) return;
    const held = slot.detail;
    if (held && held.width === page.width && covers(held.rect, need)) return;
    const margin = Math.max(view.width, view.height) * DETAIL_MARGIN;
    const rect = detailRect(page, view, margin, dpr) ?? need;
    cancelDetail(slot);
    const gen = slot.detailGen;
    const canvas = document.createElement("canvas");
    try {
      const pdfPage = await doc.getPage(slot.index);
      if (gen !== slot.detailGen) return;
      const viewport = pdfPage.getViewport({
        scale: (page.width * dpr) / base.width,
        offsetX: -rect.x * dpr,
        offsetY: -rect.y * dpr,
      });
      placeDetail(canvas, rect, page, dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render = pdfPage.render({ canvas, canvasContext: ctx, viewport });
      slot.detailTask = render;
      await render.promise;
      if (gen !== slot.detailGen || !slot.canvas) return;
      slot.detailTask = null;
      showDetail(slot, { canvas, rect, width: page.width });
    } catch (error) {
      noteUnlessCancelled(error);
    } finally {
      if (slot.detail?.canvas !== canvas) freeCanvas(canvas);
    }
  };

  return { snap, draw, drawDetail, cancelDetail, invalidate, release };
}
