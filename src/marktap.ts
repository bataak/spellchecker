import { marksAtY } from "./backdrop.ts";
import type { Token } from "./spell/textcheck.ts";

export interface MarkTapDeps {
  readonly editor: HTMLTextAreaElement;
  readonly tokens: () => readonly Token[];
  readonly show: (token: Token) => void;
}

export interface MarkTap {
  consumeClick(): boolean;
}

function markAtPoint(x: number, y: number): HTMLElement | null {
  for (const mark of marksAtY(y)) {
    for (const rect of mark.getClientRects()) {
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return mark;
    }
  }
  return null;
}

export function initMarkTap(deps: MarkTapDeps): MarkTap {
  let suppressClick = false;

  const tokenForMark = (mark: HTMLElement): Token | null => {
    const start = Number(mark.getAttribute("data-start"));
    for (const token of deps.tokens()) if (token.start === start) return token;
    return null;
  };

  deps.editor.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    suppressClick = false;
    const mark = markAtPoint(e.clientX, e.clientY);
    if (!mark) return;
    const token = tokenForMark(mark);
    if (!token) return;
    e.preventDefault();
    suppressClick = true;
    deps.show(token);
  });

  return {
    consumeClick() {
      const suppressed = suppressClick;
      suppressClick = false;
      return suppressed;
    },
  };
}
