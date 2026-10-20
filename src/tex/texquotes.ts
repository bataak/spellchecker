import { replaceRange } from "../editor/editortext.ts";

const QUOTES: Readonly<Record<string, string>> = { ь: "«", в: "»" };

export interface QuoteEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly caret: number;
  readonly original: string;
}

export function undoQuote(
  text: string,
  caret: number,
  last: QuoteEdit,
): QuoteEdit | null {
  if (caret !== last.caret) return null;
  if (text.slice(last.from, last.from + 1) !== last.insert) return null;
  return {
    from: last.from,
    to: last.from + 1,
    insert: last.original,
    caret: caret + last.original.length - 1,
    original: last.insert,
  };
}

export function quoteEdit(
  text: string,
  caret: number,
  typed: string,
): QuoteEdit | null {
  const letter = typed.toLowerCase();
  const quote = QUOTES[letter];
  if (!quote || typed.length !== 1) return null;
  const from = caret - 2;
  if (from < 0) return null;
  const pair = text.slice(from, caret);
  if (pair.toLowerCase() !== letter + letter) return null;
  if (text[from - 1]?.toLowerCase() === letter) return null;
  return { from, to: caret, insert: quote, caret: from + 1, original: pair };
}

export interface TexQuotesDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
}

export function initTexQuotes(deps: TexQuotesDeps): void {
  const { editor } = deps;
  let last: QuoteEdit | null = null;

  const apply = (edit: QuoteEdit): void => {
    replaceRange(editor, edit.from, edit.to, edit.insert);
    editor.setSelectionRange(edit.caret, edit.caret);
  };

  editor.addEventListener("input", (event) => {
    last = null;
    if (!(event instanceof InputEvent) || event.isComposing) return;
    if (editor.readOnly || !deps.active()) return;
    const caret = editor.selectionStart;
    if (caret !== editor.selectionEnd) return;
    if (event.inputType !== "insertText" || event.data === null) return;
    const edit = quoteEdit(editor.value, caret, event.data);
    if (!edit) return;
    apply(edit);
    last = edit;
  });

  editor.addEventListener("beforeinput", (event) => {
    if (event.inputType !== "deleteContentBackward" || !last) return;
    const caret = editor.selectionStart;
    const undo =
      caret === editor.selectionEnd
        ? undoQuote(editor.value, caret, last)
        : null;
    last = null;
    if (!undo) return;
    event.preventDefault();
    apply(undo);
  });

  editor.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace" && !event.defaultPrevented) last = null;
  });
  editor.addEventListener("pointerdown", () => {
    last = null;
  });
}
