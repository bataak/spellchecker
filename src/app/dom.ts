export function requireEl<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error("missing element: " + selector);
  return el;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function queryShell() {
  const workspace = requireEl(".workspace");
  return {
    status: requireEl("#statusText"),
    editor: requireEl<HTMLTextAreaElement>("#editor"),
    backdrop: requireEl("#backdrop"),
    popover: requireEl("#popover"),
    emptyState: document.querySelector<HTMLElement>("#emptyState"),
    workspace,
    editorWrap: requireEl(".editor-wrap", workspace),
    desktopMQ: window.matchMedia("(min-width: 1024px)"),
    narrowMQ: window.matchMedia("(max-width: 700px)"),
    touchMQ: window.matchMedia("(pointer: coarse)"),
  };
}

export function queryControls() {
  const byId = (id: string): HTMLElement | null =>
    document.querySelector<HTMLElement>("#" + id);
  return {
    save: byId("saveBtn"),
    fixButtons: {
      decode: document.querySelector<HTMLButtonElement>("#decodeBtn"),
      clean: document.querySelector<HTMLButtonElement>("#cleanBtn"),
    },
    clear: byId("clearBtn"),
    emptyTips: { info: byId("emptyNoteInfo"), action: byId("emptyNoteAction") },
    appearance: {
      theme: requireEl("#themeBtn"),
      fontInc: requireEl("#fontIncBtn"),
      fontDec: requireEl("#fontDecBtn"),
      fontReset: requireEl("#fontResetBtn"),
    },
  };
}
