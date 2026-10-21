import { isTouch } from "../editor/input.ts";
import { fitVertically, visibleView } from "./popgeom.ts";

export interface PlacerDeps {
  readonly popover: HTMLElement;
  readonly anchor: () => DOMRect | null;
  readonly lost: () => void;
  readonly placed: () => void;
}

export interface Placer {
  measure(): void;
  place(): void;
  forget(): void;
}

function setStyle(
  target: HTMLElement,
  name: "top" | "left" | "maxHeight" | "overflowY",
  value: string,
): void {
  if (target.style[name] !== value) target.style[name] = value;
}

export function popoverScroller(popover: HTMLElement): HTMLElement | null {
  return (
    popover.querySelector<HTMLElement>(".pop-list") ??
    popover.querySelector<HTMLElement>(".pop-def-body")
  );
}

export function createPlacer(d: PlacerDeps): Placer {
  const { popover } = d;
  let fullH = 0;
  let chromeH = 0;

  function measure(): void {
    const target = popoverScroller(popover);
    if (!target) return;
    target.style.maxHeight = "";
    target.style.overflowY = "";
    popover.style.maxHeight = "";
    fullH = popover.offsetHeight;
    chromeH = fullH - target.offsetHeight;
  }

  function placeSheet(rect: DOMRect): void {
    const fit = fitVertically(
      rect,
      visibleView(),
      fullH || popover.offsetHeight,
      8,
    );
    setStyle(popover, "maxHeight", fit.height + "px");
    const body = popover.querySelector<HTMLElement>(".pop-def-body");
    if (body) {
      setStyle(body, "maxHeight", "");
      setStyle(body, "overflowY", "auto");
    }
    setStyle(popover, "top", fit.top + "px");
    setStyle(popover, "left", "");
  }

  function placeNear(rect: DOMRect): void {
    const margin = 6;
    const view = visibleView();
    const popW = popover.offsetWidth;
    const fit = fitVertically(
      rect,
      view,
      fullH || popover.offsetHeight,
      margin,
    );
    const target = popoverScroller(popover);
    if (target) {
      setStyle(
        target,
        "maxHeight",
        fit.capped ? fit.height - chromeH + "px" : "",
      );
      setStyle(target, "overflowY", fit.capped ? "auto" : "");
    }
    const left = Math.max(
      view.left + margin,
      Math.min(rect.left, view.left + view.width - popW - margin),
    );
    setStyle(popover, "top", window.scrollY + fit.top + "px");
    setStyle(popover, "left", window.scrollX + left + "px");
    d.placed();
  }

  function place(): void {
    if (popover.hidden) return;
    const sheet = isTouch() && popover.dataset.view === "def";
    if (!sheet) setStyle(popover, "maxHeight", "");
    const rect = d.anchor();
    if (!rect) {
      d.lost();
      return;
    }
    if (sheet) placeSheet(rect);
    else placeNear(rect);
  }

  return {
    measure,
    place,
    forget: () => {
      fullH = 0;
    },
  };
}
