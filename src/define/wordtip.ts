import type { Backdrop } from "../editor/backdrop.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import type { WordSpan } from "../spell/lookup.ts";
import type { Definition } from "./definitions.ts";
import type { WordAnchor } from "./wordanchor.ts";

const LATIN = /\p{Script=Latin}/u;

export interface WordTipDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly anchor: WordAnchor;
  readonly definitionFor: (word: string) => Promise<Definition>;
  readonly isOpen: () => boolean;
  readonly hide: () => void;
  readonly position: () => void;
  readonly show: (anchor: HTMLElement, word: string) => Promise<void>;
  readonly beforeShow: () => void;
  readonly holdStatus: (html: string, ms?: number, animate?: boolean) => void;
}

export interface WordTip {
  follow(): void;
  showDefinition(span: WordSpan, pointerX?: number): Promise<void>;
  pointerX(): number | null;
  forget(): void;
}

export function createWordTip(d: WordTipDeps): WordTip {
  let span: WordSpan | null = null;
  let ticket = 0;
  let pointer: number | null = null;

  const visibleInEditor = (rect: DOMRect): boolean => {
    const box = d.editor.getBoundingClientRect();
    return rect.top >= box.top - 2 && rect.bottom <= box.bottom + 2;
  };
  const hideIfOpen = (): void => {
    if (d.isOpen()) d.hide();
  };

  return {
    follow() {
      const rect = span ? d.backdrop.rangeRectAt(span.start, span.end) : null;
      if (!rect || !visibleInEditor(rect)) {
        hideIfOpen();
        return;
      }
      d.anchor.at(rect);
      d.position();
    },
    async showDefinition(next, pointerX) {
      const quiet = pointerX !== undefined;
      const rect = d.backdrop.rangeRectAt(next.start, next.end);
      if (!rect || !visibleInEditor(rect)) return;
      const mine = ++ticket;
      const def = await d.definitionFor(next.word);
      if (mine !== ticket) return;
      if (quiet && !def.entries.length) {
        hideIfOpen();
        return;
      }
      if (d.isOpen() && (span?.start !== next.start || span?.end !== next.end))
        d.hide();
      span = next;
      pointer = pointerX ?? null;
      d.beforeShow();
      if (!def.entries.length) {
        d.holdStatus(
          "Тайлбар олдсонгүй: " + escapeHtml(next.word),
          3000,
          false,
        );
        return;
      }
      const anchor = d.anchor.at(rect);
      anchor.dataset.script = LATIN.test(next.word) ? "latin" : "other";
      await d.show(anchor, next.word);
    },
    pointerX: () => pointer,
    forget: () => {
      span = null;
    },
  };
}
