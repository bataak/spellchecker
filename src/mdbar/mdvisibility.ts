import type { ButtonState } from "./mdbuttonstate.ts";

const TITLE_HOLD_MS = 3000;
const FOCUS_SETTLE_MS = 150;

export interface VisibilityDeps {
  readonly bar: HTMLElement;
  readonly group: HTMLElement;
  readonly picker: HTMLElement;
  readonly editor: HTMLTextAreaElement;
  readonly mount: HTMLElement | null;
  readonly buttons: ButtonState;
  readonly menu: { contains(el: Element): boolean; isOpen(): boolean };
  readonly tools?: { sync(): void };
  readonly active: () => boolean;
  readonly beforeSync: () => void;
  readonly afterSync: () => void;
}

export interface BarVisibility {
  sync(): void;
  hold(): void;
  destroy(): void;
}

export function createBarVisibility(d: VisibilityDeps): BarVisibility {
  const { bar, group, editor, buttons } = d;
  let ready = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;

  function focused(): boolean {
    const focus = document.activeElement;
    return (
      focus === editor ||
      (focus !== null && (bar.contains(focus) || d.menu.contains(focus)))
    );
  }

  function sync(): void {
    if (settle) {
      clearTimeout(settle);
      settle = null;
    }
    const on = d.active();
    const show = (ready && focused()) || d.menu.isOpen();
    d.beforeSync();
    d.tools?.sync();
    d.picker.classList.toggle("is-plain", !on);
    editor.parentElement?.classList.toggle("is-markdown", on);
    if (group.hidden !== !on) {
      group.hidden = !on;
      buttons.reset();
    }
    if (bar.hidden !== !show) {
      bar.hidden = !show;
      d.mount?.classList.toggle("has-mdbar", show);
      buttons.reset();
    }
    d.afterSync();
    buttons.sync();
  }

  function hold(): void {
    if (readyTimer) clearTimeout(readyTimer);
    ready = false;
    sync();
    readyTimer = setTimeout(() => {
      readyTimer = null;
      ready = true;
      sync();
    }, TITLE_HOLD_MS);
  }

  const onFocus = (): void => {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = null;
      sync();
    }, FOCUS_SETTLE_MS);
  };
  const onSelectionChange = (): void => {
    if (!bar.hidden && document.activeElement === editor) buttons.sync();
  };
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    sync,
    hold,
    destroy() {
      if (readyTimer) clearTimeout(readyTimer);
      if (settle) clearTimeout(settle);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
