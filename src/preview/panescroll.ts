import { loadScrollX, saveScrollX, scrollRatio } from "./viewprefs.ts";

const SAVE_DELAY_MS = 300;

export function keepScrollX(
  body: HTMLElement,
  tracking: () => boolean,
): () => void {
  let scrollX = loadScrollX();
  let saveTimer: number | undefined;

  const flush = (): void => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (scrollX !== null) saveScrollX(scrollX);
  };

  body.addEventListener(
    "scroll",
    () => {
      if (!tracking()) return;
      const ratio = scrollRatio(
        body.scrollLeft,
        body.scrollWidth - body.clientWidth,
      );
      if (ratio === null || ratio === scrollX) return;
      scrollX = ratio;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    { passive: true },
  );
  window.addEventListener("pagehide", () => {
    if (saveTimer !== undefined) flush();
  });

  return () => {
    const range = body.scrollWidth - body.clientWidth;
    if (scrollX !== null && range > 0)
      body.scrollLeft = Math.round(scrollX * range);
  };
}
