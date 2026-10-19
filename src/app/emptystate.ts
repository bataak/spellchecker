import { syncEmptyTips } from "../ui/emptytips.ts";
import { KEYS, write } from "../core/store.ts";

export interface EmptyStateDeps {
  readonly el: HTMLElement | null;
  readonly textChanged: () => void;
  readonly cleared: () => void;
}

export function createEmptyState(deps: EmptyStateDeps): (text: string) => void {
  return (text) => {
    const empty = text.length === 0;
    deps.textChanged();
    if (empty) deps.cleared();
    if (!deps.el) return;
    deps.el.classList.toggle("is-hidden", !empty);
    deps.el.setAttribute("aria-hidden", empty ? "false" : "true");
    const root = document.documentElement;
    if (root.classList.contains("has-text") === empty) {
      root.classList.toggle("has-text", !empty);
      write(KEYS.hasText, empty ? "0" : "1");
    }
    syncEmptyTips(empty);
  };
}
