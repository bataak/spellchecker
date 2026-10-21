import { isTouch } from "../editor/input.ts";

export interface DotControl {
  readonly isAnchor: (el: HTMLElement) => boolean;
  readonly show: (el: HTMLElement, word: string) => void;
  readonly hide: () => void;
  readonly scheduleHide: () => void;
  readonly showPanel: (word: string) => void;
}

export function bindDefDot(dot: HTMLElement, c: DotControl): void {
  const word = dot.previousElementSibling?.textContent ?? "";
  if (!word) return;
  let pointerKind = "";
  dot.addEventListener("mousedown", (e) => e.preventDefault());
  dot.addEventListener("pointerdown", (e) => {
    pointerKind = e.pointerType;
  });
  dot.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") c.show(dot, word);
  });
  dot.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch" && c.isAnchor(dot)) c.scheduleHide();
  });
  dot.addEventListener("click", (e) => {
    e.stopPropagation();
    const kind = pointerKind;
    pointerKind = "";
    if (kind === "mouse" || kind === "pen") return;
    if (isTouch()) {
      c.showPanel(word);
      return;
    }
    if (c.isAnchor(dot)) c.hide();
    else c.show(dot, word);
  });
  dot.addEventListener("focus", () => {
    if (!pointerKind) c.show(dot, word);
  });
  dot.addEventListener("blur", () => {
    if (c.isAnchor(dot)) c.hide();
  });
}
