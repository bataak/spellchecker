import type { StatusPort } from "../core/ports.ts";

export interface StatusControl extends StatusPort {
  pin(html: string | null): void;
}

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
  let pinned: string | null = null;

  const show = (html: string, animate: boolean): void => {
    el.innerHTML = html;
    el.classList.remove("status-reveal");
    if (!animate) return;
    void el.offsetWidth;
    el.classList.add("status-reveal");
  };
  const holding = (): boolean => holdUntil > 0 && Date.now() < holdUntil;

  const set = (html: string, animate = true): void => {
    if (holding() || pinned !== null) return;
    show(html, animate);
  };

  function hold(html: string, ms = STATUS_HOLD_MS, animate = true): void {
    if (holdTimer) clearTimeout(holdTimer);
    show(html, animate);
    holdUntil = Date.now() + ms;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holdUntil = 0;
      if (pinned !== null) show(pinned, false);
      else onRelease();
    }, ms);
  }

  function pin(html: string | null): void {
    if (html === pinned) return;
    pinned = html;
    if (holding()) return;
    if (html !== null) show(html, false);
    else onRelease();
  }

  function release(): void {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdUntil = 0;
    if (pinned !== null) show(pinned, false);
  }

  return { set, hold, release, pin };
}
