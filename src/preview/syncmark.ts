const FADE_MS = 1200;
const SIZE = 0.011;
const GAP = 0.5;
const LIFT = 0.0045;
const FALLBACK_LEFT = 0.08;

export interface SyncMark {
  show(page: HTMLElement, y: number, left: number | null): void;
  clear(): void;
}

export function markBox(
  page: { top: number; left: number; width: number; height: number },
  y: number,
  left: number | null,
): { top: number; left: number; size: number } {
  const size = page.height * SIZE;
  const edge = page.left + (left ?? FALLBACK_LEFT) * page.width;
  return {
    top: page.top + y * page.height - page.height * LIFT - size / 2,
    left: Math.max(page.left + 2, edge - size * (1 + GAP)),
    size,
  };
}

export function createSyncMark(list: HTMLElement): SyncMark {
  let mark: HTMLElement | null = null;
  let timer = 0;
  return {
    show(page, y, left) {
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
      );
      mark.style.top = box.top + "px";
      mark.style.left = box.left + "px";
      mark.style.width = box.size + "px";
      mark.style.height = box.size + "px";
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
