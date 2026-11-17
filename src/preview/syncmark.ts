const FADE_MS = 1200;
const SIZE = 0.011;
const MIN_PX = 6;
const GAP = 0.5;
const LIFT = 0.0045;
const FALLBACK_LEFT = 0.08;

export interface SyncMark {
  show(page: HTMLElement, y: number, left: number | null, right?: number): void;
  clear(): void;
}

export function markBox(
  page: { top: number; left: number; width: number; height: number },
  y: number,
  left: number | null,
  right?: number,
): { top: number; left: number; size: number; flipped: boolean } {
  const size = Math.max(page.height * SIZE, MIN_PX);
  const top = page.top + y * page.height - page.height * LIFT - size / 2;
  if (right !== undefined)
    return {
      top,
      left: Math.min(
        page.left + right * page.width + size * GAP,
        page.left + page.width - size - 2,
      ),
      size,
      flipped: true,
    };
  const edge = page.left + (left ?? FALLBACK_LEFT) * page.width;
  return {
    top,
    left: Math.max(page.left + 2, edge - size * (1 + GAP)),
    size,
    flipped: false,
  };
}

export function createSyncMark(list: HTMLElement): SyncMark {
  let mark: HTMLElement | null = null;
  let timer = 0;
  return {
    show(page, y, left, right) {
      mark ??= document.createElement("div");
      mark.className = "sync-mark";
      const box = markBox(
        {
          top: page.offsetTop + page.clientTop,
          left: page.offsetLeft + page.clientLeft,
          width: page.clientWidth,
          height: page.clientHeight,
        },
        y,
        left,
        right,
      );
      mark.style.top = box.top + "px";
      mark.style.left = box.left + "px";
      mark.style.width = box.size + "px";
      mark.style.height = box.size + "px";
      mark.classList.toggle("is-flipped", box.flipped);
      mark.classList.remove("is-fading");
      list.append(mark);
      clearTimeout(timer);
      timer = window.setTimeout(
        () => mark?.classList.add("is-fading"),
        FADE_MS,
      );
    },
    clear() {
      clearTimeout(timer);
    },
  };
}
