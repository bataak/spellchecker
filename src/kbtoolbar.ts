export interface ViewportLike {
  height: number;
  offsetTop: number;
}

export interface PageViewport {
  pageTop: number;
  pageLeft: number;
  width: number;
  height: number;
}

export interface Baseline {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  width: number;
}

export const KEYBOARD_THRESHOLD = 150;

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

export function placeAboveKeyboard(
  viewport: PageViewport,
  barHeight: number,
  origin: { top: number; left: number },
): Placement {
  return {
    top: Math.round(
      viewport.pageTop + viewport.height - barHeight - origin.top,
    ),
    left: Math.round(viewport.pageLeft - origin.left),
    width: Math.round(viewport.width),
  };
}

export function coveredHeight(
  baselineHeight: number,
  viewportHeight: number,
  barHeight: number,
): number {
  return Math.max(0, Math.round(baselineHeight - viewportHeight + barHeight));
}

export const CARET_MARGIN = 8;

export function revealDelta(
  caretBottom: number,
  barTop: number,
  margin = CARET_MARGIN,
): number {
  return Math.max(0, Math.ceil(caretBottom + margin - barTop));
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

const TRANSPARENT = /^(transparent|rgba\([^)]*,\s*0(\.0+)?\))$/;

export function firstOpaque(colors: string[]): string | null {
  return (
    colors.find((color) => color && !TRANSPARENT.test(color.trim())) ?? null
  );
}

const FLOAT_STYLE: Record<string, string> = {
  position: "absolute",
  "z-index": "30",
  margin: "0",
  "box-sizing": "border-box",
};
const PLACEMENT_PROPS = ["top", "left", "width"];

function backgroundOf(bar: HTMLElement): string {
  const chain: string[] = [];
  for (let node: Element | null = bar; node; node = node.parentElement)
    chain.push(getComputedStyle(node).backgroundColor);
  return firstOpaque(chain) ?? "Canvas";
}

function originOf(bar: HTMLElement): { top: number; left: number } {
  const rect = bar.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY - (parseFloat(bar.style.top) || 0),
    left: rect.left + window.scrollX - (parseFloat(bar.style.left) || 0),
  };
}

const SCROLL_IDLE_MS = 150;
const KEYBOARD_SETTLE_MS = 350;

export function initKeyboardToolbar(
  editor: HTMLTextAreaElement,
  mirror: HTMLElement,
): void {
  const viewport = window.visualViewport;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!viewport || !bar) return;
  let frame = 0;
  let floating = false;
  let baseline: Baseline | null = null;
  let revealPending = false;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let basePadding: [number, number] | null = null;
  let extra = -1;

  const extendScroll = (next: number): void => {
    if (next === extra) return;
    extra = next;
    if (!basePadding)
      basePadding = [
        parseFloat(getComputedStyle(editor).paddingBottom) || 0,
        parseFloat(getComputedStyle(mirror).paddingBottom) || 0,
      ];
    editor.style.paddingBottom = basePadding[0] + next + "px";
    mirror.style.paddingBottom = basePadding[1] + next + "px";
  };

  const settlePage = (): void => {
    const pageScroll = window.scrollY;
    if (pageScroll <= 0) return;
    editor.scrollTop += pageScroll;
    window.scrollTo(0, 0);
    revealPending = true;
  };

  const restoreScroll = (): void => {
    editor.style.removeProperty("padding-bottom");
    mirror.style.removeProperty("padding-bottom");
    basePadding = null;
    extra = -1;
  };

  const reveal = (): void => {
    const caret = caretRect(mirror, editor.selectionEnd);
    if (!caret) return;
    const delta = revealDelta(caret.bottom, bar.getBoundingClientRect().top);
    if (delta) editor.scrollTop += delta;
  };

  const apply = (): void => {
    frame = 0;
    baseline = nextBaseline(
      baseline,
      window.innerWidth,
      Math.max(window.innerHeight, viewport.height),
    );
    const next =
      document.activeElement === editor && isKeyboardOpen(baseline, viewport);
    if (next !== floating) {
      floating = next;
      revealPending = next;
      bar.classList.toggle("kb-float", next);
      if (next) {
        const background = backgroundOf(bar);
        for (const [name, value] of Object.entries(FLOAT_STYLE))
          bar.style.setProperty(name, value);
        bar.style.backgroundColor = background;
        bar.style.top = "0px";
        bar.style.left = "0px";
        hideFor(KEYBOARD_SETTLE_MS);
      } else {
        clearTimeout(scrollTimer);
        restoreScroll();
        bar.style.removeProperty("visibility");
        for (const name of [...Object.keys(FLOAT_STYLE), ...PLACEMENT_PROPS])
          bar.style.removeProperty(name);
        bar.style.removeProperty("background-color");
      }
    }
    if (!next) return;
    const barHeight = bar.getBoundingClientRect().height;
    extendScroll(coveredHeight(baseline.height, viewport.height, barHeight));
    settlePage();
    const origin = originOf(bar);
    const placement = placeAboveKeyboard(viewport, barHeight, origin);
    bar.style.top = placement.top + "px";
    bar.style.left = placement.left + "px";
    bar.style.width = placement.width + "px";
    if (!revealPending) return;
    revealPending = false;
    reveal();
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  let hiddenUntil = 0;

  const hideFor = (ms: number): void => {
    hiddenUntil = Math.max(hiddenUntil, performance.now() + ms);
    bar.style.visibility = "hidden";
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      bar.style.removeProperty("visibility");
      schedule();
    }, hiddenUntil - performance.now());
  };

  const onScroll = (): void => {
    if (floating) hideFor(SCROLL_IDLE_MS);
  };

  const scheduleReveal = (): void => {
    revealPending = true;
    schedule();
  };

  apply();
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  editor.addEventListener("focus", schedule);
  editor.addEventListener("blur", schedule);
  editor.addEventListener(
    "scroll",
    () => {
      if (floating && editor.scrollTop <= 0 && window.scrollY > 0)
        window.scrollTo({ top: 0, behavior: "smooth" });
    },
    { passive: true },
  );
  editor.addEventListener("input", scheduleReveal);
  document.addEventListener("selectionchange", () => {
    if (floating && document.activeElement === editor) scheduleReveal();
  });
  bar.addEventListener("mousedown", (event) => {
    if (floating) event.preventDefault();
  });
}
