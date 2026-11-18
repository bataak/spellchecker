import { KEYS, read, remove, write } from "../core/store.ts";

export interface Offset {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function parseOffset(raw: string | null): Offset | null {
  const [x, y] = (raw ?? "").split(",").map(Number);
  return raw && Number.isFinite(x) && Number.isFinite(y)
    ? { x: x!, y: y! }
    : null;
}

function within(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}

export function clampOffset(want: Offset, natural: Box, room: Box): Offset {
  return {
    x: within(want.x, room.left - natural.left, room.right - natural.right),
    y: within(want.y, room.top - natural.top, room.bottom - natural.bottom),
  };
}

export interface FindDrag {
  fit(): void;
  destroy(): void;
}

export interface Corner {
  readonly right: number;
  readonly top: number;
}

function viewport(): Box {
  const root = document.documentElement;
  return {
    left: 0,
    top: 0,
    right: root.clientWidth,
    bottom: root.clientHeight,
  };
}

export function placeBar(
  corner: Corner,
  width: number,
  height: number,
  room: Box,
): Offset {
  return clampOffset(
    { x: corner.right - width, y: corner.top },
    { left: 0, top: 0, right: width, bottom: height },
    room,
  );
}

export function makeFindDrag(
  bar: HTMLElement,
  grip: HTMLElement,
  home: () => Corner,
  watched: () => readonly Element[],
): FindDrag {
  let spot = parseOffset(read(KEYS.findPos));
  let at: Offset = { x: 0, y: 0 };
  let grab: { x: number; y: number; from: Offset } | null = null;

  const put = (want: Offset): void => {
    const room = viewport();
    at = clampOffset(
      want,
      { left: 0, top: 0, right: bar.offsetWidth, bottom: bar.offsetHeight },
      room,
    );
    bar.style.transform = "translate(" + at.x + "px," + at.y + "px)";
  };
  const fit = (): void => {
    if (bar.hidden || grab) return;
    for (const el of watched()) sized.observe(el);
    const room = viewport();
    const corner = spot ? { right: room.right + spot.x, top: spot.y } : home();
    at = placeBar(corner, bar.offsetWidth, bar.offsetHeight, room);
    bar.style.transform = "translate(" + at.x + "px," + at.y + "px)";
  };
  const save = (): void => {
    spot = { x: at.x + bar.offsetWidth - viewport().right, y: at.y };
    write(KEYS.findPos, spot.x + "," + spot.y);
  };

  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grab = { x: e.clientX, y: e.clientY, from: at };
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => {
    if (!grab) return;
    put({
      x: grab.from.x + e.clientX - grab.x,
      y: grab.from.y + e.clientY - grab.y,
    });
  });
  const drop = (): void => {
    if (!grab) return;
    grab = null;
    save();
  };
  grip.addEventListener("pointerup", drop);
  grip.addEventListener("pointercancel", drop);
  grip.addEventListener("dblclick", () => {
    spot = null;
    remove(KEYS.findPos);
    fit();
  });
  const sized: ResizeObserver = new ResizeObserver(() => fit());
  sized.observe(bar);
  sized.observe(document.documentElement);
  window.addEventListener("resize", fit);

  return {
    fit,
    destroy() {
      sized.disconnect();
      window.removeEventListener("resize", fit);
    },
  };
}
