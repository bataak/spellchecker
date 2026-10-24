import type { DecodeControl } from "../editor/decode.ts";
import {
  composeDropped,
  composeTypedWord,
  pasteComposed,
  remoteChanges,
  swapOrigin,
  type EditorText,
} from "../editor/editortext.ts";
import { isBulkDelete, isSeparatorInput } from "../editor/input.ts";
import type { MarkLayer } from "../editor/marklayer.ts";
import type { MarkTap } from "../editor/marktap.ts";
import type { FixFlow } from "../spell/fixflow.ts";
import type { Token } from "../spell/textcheck.ts";
import type { SuggestPopover } from "../ui/suggestpopover.ts";
import type { CheckLoop } from "./checkloop.ts";

const NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export type Caret = { start: number; end: number };

export function bindComposition(
  editor: HTMLTextAreaElement,
  announce: () => void,
): void {
  editor.addEventListener("paste", (event) => {
    if (pasteComposed(editor, event)) announce();
  });
  editor.addEventListener("input", (event) => {
    if (!(event instanceof InputEvent)) return;
    if (composeDropped(editor, event) || composeTypedWord(editor, event))
      announce();
  });
}

export function bindArming(
  editor: HTMLTextAreaElement,
  editorText: () => EditorText,
  fixFlow: () => FixFlow,
  tokenAtCaret: () => Token | null,
): () => boolean {
  let hadSelection = false;
  editor.addEventListener("beforeinput", () => {
    hadSelection = editor.selectionStart !== editor.selectionEnd;
    if (editorText().programmatic()) return;
    fixFlow().arm(tokenAtCaret());
  });
  return () => hadSelection;
}

export interface EditorInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly editorText: EditorText;
  readonly marks: MarkLayer;
  readonly fixFlow: FixFlow;
  readonly loop: CheckLoop;
  readonly hadSelection: () => boolean;
  readonly hidePopover: () => void;
  readonly textChanged: (text: string) => void;
  readonly saveSoon: () => void;
  readonly fixers: readonly DecodeControl[];
  readonly setLastCaret: (caret: Caret) => void;
  readonly markTap: MarkTap;
  readonly suggest: SuggestPopover;
  readonly tokenAtCaret: () => Token | null;
}

export function bindEditorInput(deps: EditorInputDeps): void {
  const { editor, marks, fixFlow, loop } = deps;

  editor.addEventListener("input", (e) => {
    const swapped = swapOrigin(e) !== null;
    if (swapped) marks.show(editor.value, []);
    marks.follow();
    if (deps.editorText.programmatic()) return;
    if (!(e instanceof InputEvent)) return;
    const remote = remoteChanges(e);
    if (remote) {
      for (let i = remote.length - 1; i >= 0; i--) {
        const change = remote[i]!;
        marks.shift(editor.value, {
          start: change.from,
          oldEnd: change.to,
          newEnd: change.from + change.insert.length,
        });
      }
      deps.textChanged(editor.value);
      deps.saveSoon();
      loop.recheckSoon();
      return;
    }
    deps.hidePopover();
    deps.textChanged(editor.value);
    deps.saveSoon();
    if (isSeparatorInput(e)) void loop.recheckAfterSeparator();
    else {
      if (
        swapped ||
        deps.hadSelection() ||
        editor.value.length === 0 ||
        isBulkDelete(e)
      )
        void loop.render();
      loop.recheckSoon();
    }
    for (const fixer of deps.fixers) fixer.afterInput(e);
  });

  editor.addEventListener("blur", () => {
    fixFlow.drop();
    deps.setLastCaret({
      start: editor.selectionStart,
      end: editor.selectionEnd,
    });
  });

  editor.addEventListener("click", () => {
    fixFlow.drop();
    if (deps.markTap.consumeClick()) return;
    deps.suggest.atCaret();
  });

  editor.addEventListener("keyup", (e) => {
    if (NAV_KEYS.has(e.key)) fixFlow.drop();
  });

  editor.addEventListener("contextmenu", (e) => {
    const caretToken = deps.tokenAtCaret();
    if (caretToken) {
      e.preventDefault();
      void deps.suggest.showFor(caretToken);
    }
  });
}
