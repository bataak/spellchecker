import { caretInTable } from "../mdbar/mdedit.ts";
import type { Backdrop } from "./backdrop.ts";

const NARROW = "(max-width: 700px)";
const EDGE_PX = 24;

export interface TableWrapDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly syncScroll: () => void;
}

export function initTableWrap(deps: TableWrapDeps): () => void {
  const { editor, backdrop } = deps;
  const wrap = editor.parentElement;
  const narrow = window.matchMedia?.(NARROW);
  let on = false;

  const wanted = (): boolean =>
    !!wrap &&
    !!narrow?.matches &&
    wrap.classList.contains("is-markdown") &&
    document.activeElement === editor &&
    caretInTable(editor.value, editor.selectionStart);

  const reveal = (): void => {
    const caret = editor.selectionStart;
    const rect =
      caret > 0
        ? backdrop.rangeRectAt(caret - 1, caret)
        : backdrop.rangeRectAt(caret, caret + 1);
    if (!rect) return;
    const box = editor.getBoundingClientRect();
    if (rect.right > box.right - EDGE_PX)
      editor.scrollLeft += rect.right - (box.right - EDGE_PX);
    else if (rect.left < box.left + EDGE_PX)
      editor.scrollLeft -= box.left + EDGE_PX - rect.left;
  };

  const sync = (): void => {
    const next = wanted();
    if (next === on) return;
    on = next;
    wrap?.classList.toggle("is-table-line", on);
    if (on) reveal();
    else editor.scrollLeft = 0;
    deps.syncScroll();
  };

  document.addEventListener("selectionchange", sync);
  editor.addEventListener("input", sync);
  editor.addEventListener("focus", sync);
  editor.addEventListener("blur", sync);
  narrow?.addEventListener("change", sync);
  return sync;
}
