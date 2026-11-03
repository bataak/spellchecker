import { initScrollHint } from "./scrollhint.ts";

function toolbarNeed(bar: HTMLElement): number {
  const cs = getComputedStyle(bar);
  const gap = Number.parseFloat(cs.columnGap) || 0;
  let w =
    (Number.parseFloat(cs.paddingLeft) || 0) +
    (Number.parseFloat(cs.paddingRight) || 0);
  let count = 0;
  for (const el of bar.children) {
    const e = el as HTMLElement;
    if (e.hidden || e.offsetParent === null) continue;
    w += e.getBoundingClientRect().width;
    count += 1;
  }
  return w + Math.max(count - 1, 0) * gap;
}

function syncToolbar(bar: HTMLElement | null): void {
  const host = bar?.parentElement;
  if (!bar || !host) return;
  const room = host.getBoundingClientRect().width;
  const wide = toolbarNeed(bar) > room + 0.5;
  if (wide) document.documentElement.dataset.toolbar = "wide";
  else delete document.documentElement.dataset.toolbar;
}

export function createToolbarFit(): { sync(): void; destroy(): void } {
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const hint = bar ? initScrollHint(bar) : null;
  return {
    sync() {
      syncToolbar(bar);
      hint?.sync();
    },
    destroy: () => hint?.destroy(),
  };
}
