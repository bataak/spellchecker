import type { MarkLayer } from "../editor/marklayer.ts";
import { tokenizeAll, type SpellSession } from "../spell/spellsession.ts";
import type { Token } from "../spell/textcheck.ts";
import type { TextEdit } from "../editor/tokenshift.ts";
import type { DocStatus } from "./docstatus.ts";

const DEFERRED_CHECK_MS = 1500;
const LARGE_TEXT = 50_000;
const LARGE_SETTLE_MS = 250;

export interface CheckLoopDeps {
  readonly editor: HTMLTextAreaElement;
  readonly spell: SpellSession;
  readonly marks: MarkLayer;
  readonly docStatus: DocStatus;
  readonly prepare: (text: string) => void;
  readonly unready: (text: string) => void;
  readonly painted: (text: string, bad: Token[]) => void;
  readonly setText: (text: string, caret: number) => TextEdit | null;
  readonly hidePopover: () => void;
  readonly save: () => void;
  readonly propagate: () => Promise<void>;
  readonly syncScroll: () => void;
}

export interface CheckLoop {
  readonly render: () => Promise<void>;
  readonly recheckAll: () => Promise<void>;
  readonly recheck: () => Promise<void>;
  readonly recheckSoon: () => void;
  readonly recheckAfterSeparator: () => Promise<void>;
  readonly commit: (text: string, caret: number) => Promise<void>;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), ms);
  };
}

function afterPaint(): Promise<void> {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
}

export function createCheckLoop(deps: CheckLoopDeps): CheckLoop {
  const { editor, spell, marks, docStatus } = deps;
  let renderSeq = 0;

  async function render(): Promise<void> {
    const text = editor.value;
    const seq = ++renderSeq;

    deps.prepare(text);

    if (!docStatus.ready()) {
      marks.show(text, []);
      deps.unready(text);
      return;
    }

    const tokens = tokenizeAll(text);
    await spell.ensureChecked(text, tokens);
    if (seq !== renderSeq) return;
    const { bad, total } = spell.computeBad(text, tokens);
    marks.show(text, bad);
    marks.follow();
    deps.painted(text, bad);
    docStatus.update({ words: total, bad: bad.length, chars: text.length });
  }

  async function recheck(): Promise<void> {
    await render();
    await deps.propagate();
    deps.save();
  }

  const settleLarge = debounce(() => {
    void render();
    deps.save();
  }, LARGE_SETTLE_MS);

  return {
    render,
    recheckAll() {
      spell.clear();
      return render();
    },
    recheck,
    recheckSoon: debounce(() => void recheck(), DEFERRED_CHECK_MS),
    async recheckAfterSeparator() {
      if (editor.value.length <= LARGE_TEXT) return recheck();
      await deps.propagate();
      settleLarge();
    },
    async commit(text, caret) {
      deps.hidePopover();
      const top = editor.scrollTop;
      const edit = deps.setText(text, caret);
      editor.scrollTop = top;
      if (edit) {
        marks.shift(text, edit);
        deps.syncScroll();
        await afterPaint();
      }
      await render();
      deps.save();
    },
  };
}
