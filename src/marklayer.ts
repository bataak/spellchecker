import type { Backdrop } from "./backdrop.ts";
import { minimalDiff } from "./mdedit.ts";
import type { Token } from "./spell/textcheck.ts";
import { texSpans } from "./tex/texhighlight.ts";
import { shiftTokens, type TextEdit } from "./tokenshift.ts";

export interface MarkLayerDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly syncScroll: () => void;
}

export interface MarkLayer {
  tokens(): Token[];
  tex(): boolean;
  setTex(on: boolean): boolean;
  show(text: string, bad: Token[]): void;
  follow(): void;
  shift(text: string, edit: TextEdit): void;
}

export function createMarkLayer(deps: MarkLayerDeps): MarkLayer {
  const { editor, backdrop } = deps;
  let tokens: Token[] = [];
  let tex = false;

  const paint = (text: string): void => {
    backdrop.render(text, tokens);
  };

  return {
    tokens: () => tokens,
    tex: () => tex,
    setTex(on) {
      if (on === tex) return false;
      tex = on;
      backdrop.setHighlighter(on ? texSpans : null);
      editor.parentElement?.classList.toggle("is-tex", on);
      const text = editor.value;
      if (text !== backdrop.text()) tokens = [];
      paint(text);
      deps.syncScroll();
      return true;
    },
    show(text, bad) {
      tokens = bad;
      paint(text);
    },
    follow() {
      if (!tex) return;
      const text = editor.value;
      const patch = minimalDiff(backdrop.text(), text);
      if (!patch) return;
      tokens = shiftTokens(tokens, {
        start: patch.from,
        oldEnd: patch.to,
        newEnd: patch.from + patch.insert.length,
      });
      paint(text);
      deps.syncScroll();
    },
    shift(text, edit) {
      if (tex) return;
      tokens = shiftTokens(tokens, edit);
      paint(text);
    },
  };
}
