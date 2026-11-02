import { setHtml } from "../core/htmlutil.ts";
import type { Html } from "../core/htmlutil.ts";
import type { StatusPort } from "../core/ports.ts";

export interface StatusControl extends StatusPort {
  pin(markup: Html | null): void;
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
  let pinned: Html | null = null;

  const show = (markup: Html, animate: boolean): void => {
    setHtml(el, markup);
    el.classList.remove("status-reveal");
    if (!animate) return;
    void el.offsetWidth;
    el.classList.add("status-reveal");
  };
  const holding = (): boolean => holdUntil > 0 && Date.now() < holdUntil;

  const set = (markup: Html, animate = true): void => {
    if (holding() || pinned !== null) return;
    show(markup, animate);
  };

  function hold(markup: Html, ms = STATUS_HOLD_MS, animate = true): void {
    if (holdTimer) clearTimeout(holdTimer);
    show(markup, animate);
    holdUntil = Date.now() + ms;
    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      holdUntil = 0;
      if (pinned !== null) show(pinned, false);
      else onRelease();
    }, ms);
  }

  function pin(markup: Html | null): void {
    if (markup === pinned) return;
    pinned = markup;
    if (holding()) return;
    if (markup !== null) show(markup, false);
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
