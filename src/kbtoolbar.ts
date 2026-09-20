export interface ViewportLike {
  height: number;
  offsetTop: number;
}

export interface Baseline {
  width: number;
  height: number;
}

export const KEYBOARD_THRESHOLD = 150;
export const APP_HEIGHT_VAR = "--app-height";
export const KEYBOARD_CLASS = "kb-open";

export function nextBaseline(
  previous: Baseline | null,
  width: number,
  height: number,
): Baseline {
  if (!previous || previous.width !== width) return { width, height };
  return { width, height: Math.max(previous.height, height) };
}

export function isKeyboardOpen(
  baseline: Baseline,
  viewport: ViewportLike,
): boolean {
  return baseline.height - viewport.height > KEYBOARD_THRESHOLD;
}

export const CARET_MARGIN = 8;

export function revealDelta(
  caretBottom: number,
  visibleBottom: number,
  margin = CARET_MARGIN,
): number {
  return Math.max(0, Math.ceil(caretBottom + margin - visibleBottom));
}

function caretRect(mirror: HTMLElement, offset: number): DOMRect | null {
  const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const length = node.data.length;
    if (remaining > length) {
      remaining -= length;
      continue;
    }
    const range = document.createRange();
    range.setStart(node, remaining);
    range.setEnd(node, remaining);
    const rects = range.getClientRects();
    if (rects.length) return rects[rects.length - 1]!;
    if (remaining < length) range.setEnd(node, remaining + 1);
    else if (remaining > 0) range.setStart(node, remaining - 1);
    else return null;
    const rect = range.getBoundingClientRect();
    return rect.height ? rect : null;
  }
  return null;
}

function visibleBottomOf(editor: HTMLTextAreaElement): number {
  const style = getComputedStyle(editor);
  return (
    editor.getBoundingClientRect().bottom -
    (parseFloat(style.borderBottomWidth) || 0) -
    (parseFloat(style.paddingBottom) || 0)
  );
}

export function initKeyboardToolbar(
  editor: HTMLTextAreaElement,
  mirror: HTMLElement,
): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let frame = 0;
  let baseline: Baseline | null = null;
  let fitted = false;
  let revealPending = false;

  const reveal = (): void => {
    const caret = caretRect(mirror, editor.selectionEnd);
    if (!caret) return;
    const delta = revealDelta(caret.bottom, visibleBottomOf(editor));
    if (delta) editor.scrollTop += delta;
  };

  const apply = (): void => {
    frame = 0;
    baseline = nextBaseline(
      baseline,
      window.innerWidth,
      Math.max(window.innerHeight, viewport.height),
    );
    const open =
      document.activeElement === editor && isKeyboardOpen(baseline, viewport);
    if (open) {
      root.style.setProperty(
        APP_HEIGHT_VAR,
        Math.round(viewport.height) + "px",
      );
      if (window.scrollY !== 0 || viewport.offsetTop !== 0)
        window.scrollTo(0, 0);
    } else if (fitted) {
      root.style.removeProperty(APP_HEIGHT_VAR);
    }
    if (open !== fitted) {
      root.classList.toggle(KEYBOARD_CLASS, open);
      revealPending = open;
    }
    fitted = open;
    if (!open || !revealPending) return;
    revealPending = false;
    reveal();
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  const scheduleReveal = (): void => {
    if (!fitted || document.activeElement !== editor) return;
    revealPending = true;
    schedule();
  };

  apply();
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  editor.addEventListener("focus", schedule);
  editor.addEventListener("blur", schedule);
  document.addEventListener("selectionchange", scheduleReveal);
}
