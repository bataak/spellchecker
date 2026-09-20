export interface ViewportLike {
  height: number;
  offsetTop: number;
}

export const KEYBOARD_THRESHOLD = 150;

export function keyboardInset(
  layoutHeight: number,
  viewport: ViewportLike | null,
): number {
  if (!viewport) return 0;
  return Math.max(
    0,
    Math.round(layoutHeight - viewport.height - viewport.offsetTop),
  );
}

export interface Baseline {
  width: number;
  height: number;
}

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

const TRANSPARENT = /^(transparent|rgba\([^)]*,\s*0(\.0+)?\))$/;

export function firstOpaque(colors: string[]): string | null {
  return (
    colors.find((color) => color && !TRANSPARENT.test(color.trim())) ?? null
  );
}

const FLOAT_STYLE: Record<string, string> = {
  position: "fixed",
  left: "0",
  right: "0",
  bottom: "0",
  "z-index": "30",
  margin: "0",
  "box-sizing": "border-box",
};

function backgroundOf(bar: HTMLElement): string {
  const chain: string[] = [];
  for (let node: Element | null = bar; node; node = node.parentElement)
    chain.push(getComputedStyle(node).backgroundColor);
  return firstOpaque(chain) ?? "Canvas";
}

export function initKeyboardToolbar(editor: HTMLTextAreaElement): void {
  const viewport = window.visualViewport;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!viewport || !bar) return;
  let frame = 0;
  let floating = false;
  let baseline: Baseline | null = null;

  const apply = (): void => {
    frame = 0;
    baseline = nextBaseline(
      baseline,
      window.innerWidth,
      Math.max(window.innerHeight, viewport.height),
    );
    const inset = keyboardInset(window.innerHeight, viewport);
    const next =
      document.activeElement === editor && isKeyboardOpen(baseline, viewport);
    if (next !== floating) {
      floating = next;
      bar.classList.toggle("kb-float", next);
      if (next) {
        const background = backgroundOf(bar);
        for (const [name, value] of Object.entries(FLOAT_STYLE))
          bar.style.setProperty(name, value);
        bar.style.backgroundColor = background;
      } else {
        for (const name of Object.keys(FLOAT_STYLE))
          bar.style.removeProperty(name);
        bar.style.removeProperty("background-color");
      }
    }
    if (next) bar.style.transform = `translateY(${-inset}px)`;
    else bar.style.removeProperty("transform");
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  apply();
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  editor.addEventListener("focus", schedule);
  editor.addEventListener("blur", schedule);
  bar.addEventListener("mousedown", (event) => {
    if (floating) event.preventDefault();
  });
}
