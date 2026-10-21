import type { StatusPort } from "../core/ports.ts";

export type StatusControl = StatusPort;

const STATUS_HOLD_MS = 6000;

export function reveal(el: HTMLElement, name = "text-reveal"): void {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
}

export const nf = (num: number): string => num.toLocaleString("en-US");

export function initStatus(
  el: HTMLElement,
  onRelease: () => void,
): StatusControl {
  let holdUntil = 0;
  let holdTimer: number | null = null;

  const set = (html: string, animate = true): void => {
    if (holdUntil > 0 && Date.now() < holdUntil) return;
    el.innerHTML = html;
    el.classList.remove("status-reveal");
    if (!animate) return;
    void el.offsetWidth;
    el.classList.add("status-reveal");
  };

  function hold(html: string, ms = STATUS_HOLD_MS, animate = true): void {
    if (holdTimer) clearTimeout(holdTimer);
    holdUntil = 0;
    set(html, animate);
    holdUntil = Date.now() + ms;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holdUntil = 0;
      onRelease();
    }, ms);
  }

  function release(): void {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdUntil = 0;
  }

  return { set, hold, release };
}
