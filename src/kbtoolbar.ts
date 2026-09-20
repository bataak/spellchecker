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

export function isKeyboardOpen(inset: number): boolean {
  return inset > KEYBOARD_THRESHOLD;
}

export function initKeyboardToolbar(editor: HTMLTextAreaElement): void {
  const viewport = window.visualViewport;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!viewport || !bar) return;
  let frame = 0;
  let floating = false;

  const apply = (): void => {
    frame = 0;
    const inset = keyboardInset(window.innerHeight, viewport);
    const next = document.activeElement === editor && isKeyboardOpen(inset);
    if (next !== floating) {
      floating = next;
      bar.classList.toggle("kb-float", next);
      if (next)
        bar.style.backgroundColor = getComputedStyle(
          document.body,
        ).backgroundColor;
      else bar.style.removeProperty("background-color");
    }
    if (next) bar.style.transform = `translateY(${-inset}px)`;
    else bar.style.removeProperty("transform");
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  editor.addEventListener("focus", schedule);
  editor.addEventListener("blur", schedule);
  bar.addEventListener("mousedown", (event) => {
    if (floating) event.preventDefault();
  });
}
