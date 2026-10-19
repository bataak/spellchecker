import {
  anchoredScrollTop,
  captureTopAnchor,
  offsetAtY,
  rangeRectAt,
  refreshBackdropMarks,
  setActiveLine,
} from "../backdrop.ts";
import type { MarkLayer } from "../marklayer.ts";
import type { Token } from "../spell/textcheck.ts";
import { caretLine } from "../statusline.ts";
import { debounce } from "./checkloop.ts";

const MARKS_SETTLE_MS = 100;
const REVEAL_PAD = 24;
const REVEAL_LEAD_MAX = 160;
const REVEAL_LEAD_SHARE = 0.3;
const VISIBLE_ANCHOR_SHARE = 0.35;

export interface EditorViewDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: HTMLElement;
  readonly marks: () => MarkLayer;
  readonly onLine: (line: number) => void;
  readonly onScroll: () => void;
}

export interface EditorView {
  readonly syncScroll: () => void;
  readonly revealRange: (start: number, end: number) => void;
  readonly visibleOffset: () => number;
  readonly tokenAtCaret: () => Token | null;
  readonly captureTop: () => void;
}

export function createEditorView(deps: EditorViewDeps): EditorView {
  const { editor, backdrop } = deps;

  const syncScroll = (): void => {
    backdrop.scrollTop = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
  };

  const syncActiveLine = (): void => {
    const line = caretLine(editor.value, editor.selectionStart ?? 0);
    setActiveLine(line);
    deps.onLine(line);
  };

  let activeLineQueued = false;
  const syncActiveLineSoon = (): void => {
    if (activeLineQueued) return;
    activeLineQueued = true;
    requestAnimationFrame(() => {
      activeLineQueued = false;
      syncActiveLine();
    });
  };

  editor.addEventListener("click", syncActiveLineSoon);
  editor.addEventListener("keyup", syncActiveLineSoon);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editor) syncActiveLineSoon();
  });

  const refreshMarksSoon = debounce(
    () => refreshBackdropMarks(),
    MARKS_SETTLE_MS,
  );
  editor.addEventListener("scroll", () => {
    syncScroll();
    captureTopAnchor();
    deps.onScroll();
    refreshMarksSoon();
  });
  new ResizeObserver(() => {
    syncScroll();
    const top = anchoredScrollTop();
    if (top !== null && Math.abs(top - editor.scrollTop) >= 1) {
      editor.scrollTop = top;
      syncScroll();
    }
    refreshMarksSoon();
  }).observe(editor);

  const lineCount = (text: string): number => text.split("\n").length;

  return {
    syncScroll,
    captureTop: captureTopAnchor,
    revealRange(start, end) {
      editor.focus({ preventScroll: true });
      try {
        editor.setSelectionRange(start, end, "forward");
      } catch {}
      const box = editor.getBoundingClientRect();
      const rect = rangeRectAt(start, Math.max(end, start + 1));
      const top = rect
        ? rect.top - box.top + editor.scrollTop
        : ((lineCount(editor.value.slice(0, start)) - 1) /
            lineCount(editor.value)) *
          editor.scrollHeight;
      const view = editor.scrollTop;
      if (
        top < view + REVEAL_PAD ||
        top > view + editor.clientHeight - REVEAL_PAD
      ) {
        const max = editor.scrollHeight - editor.clientHeight;
        const lead = Math.min(
          editor.clientHeight * REVEAL_LEAD_SHARE,
          REVEAL_LEAD_MAX,
        );
        editor.scrollTop = Math.max(0, Math.min(top - lead, max));
      }
      syncScroll();
    },
    visibleOffset() {
      const box = editor.getBoundingClientRect();
      const view = window.visualViewport;
      const bottom = Math.min(
        box.bottom,
        view ? view.offsetTop + view.height : window.innerHeight,
      );
      const caret = editor.selectionStart;
      const rect =
        rangeRectAt(caret, caret + 1) ??
        rangeRectAt(Math.max(0, caret - 1), caret);
      if (rect && rect.top >= box.top && rect.bottom <= bottom) return caret;
      return (
        offsetAtY(box.top + (bottom - box.top) * VISIBLE_ANCHOR_SHARE) ?? caret
      );
    },
    tokenAtCaret() {
      const pos = editor.selectionStart;
      for (const token of deps.marks().tokens()) {
        if (pos >= token.start && pos <= token.end) return token;
      }
      return null;
    },
  };
}
