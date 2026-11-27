import { setHtml, trustedHtml } from "../core/htmlutil.ts";
import { svg } from "../ui/baricons.ts";
import type { FindBarDeps } from "./findbar.ts";

const COARSE = "(pointer: coarse)";

export function coarse(): boolean {
  return !!globalThis.matchMedia?.(COARSE).matches;
}

export function replaceShown(saved: string | null, touch: boolean): boolean {
  return saved === null ? !touch : saved === "1";
}

const SEARCH_ICON = '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4l4 4"/>';

export function toolButton(
  deps: Pick<FindBarDeps, "tools" | "mac">,
  run: () => void,
): HTMLButtonElement | null {
  const tools = deps.tools();
  if (!tools) return null;
  const mod = deps.mac ? "⌘F" : "Ctrl+F";
  const el = document.createElement("button");
  el.type = "button";
  el.className = "find-tool";
  el.title = "Хайх, солих (" + mod + ")";
  el.setAttribute("aria-label", "Хайх, солих");
  setHtml(el, trustedHtml(svg(SEARCH_ICON)));
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", run);
  tools.insertBefore(el, tools.querySelector(".measure-ctl"));
  return el;
}
