import { replaceRange } from "../editor/editortext.ts";

const OPEN_KEY = "ЬЬ";
const CLOSE_KEY = "ВВ";
const SPACE = /\s/;
const BEFORE_OPEN = /[\s([{]/;
const AFTER_CLOSE = /[\s.,;:!?)\]}]/;

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
  if (typed === "Ь") {
    const from = caret - OPEN_KEY.length;
    if (from < 0 || text.slice(from, caret) !== OPEN_KEY) return null;
    if (from > 0 && !BEFORE_OPEN.test(text[from - 1]!)) return null;
    return {
      from,
      to: caret,
      insert: "«",
      caret: from + 1,
      original: OPEN_KEY,
    };
  }
  if (typed.length !== 1 || !AFTER_CLOSE.test(typed)) return null;
  const to = caret - 1;
  const from = to - CLOSE_KEY.length;
  if (from < 1 || text.slice(from, to) !== CLOSE_KEY) return null;
  if (SPACE.test(text[from - 1]!)) return null;
  return { from, to, insert: "»", caret: caret - 1, original: CLOSE_KEY };
}

function typedText(event: InputEvent): string | null {
  if (event.inputType === "insertText") return event.data;
  if (
    event.inputType === "insertLineBreak" ||
    event.inputType === "insertParagraph"
  )
    return "\n";
  return null;
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
    const typed = typedText(event);
    if (typed === null) return;
    const edit = quoteEdit(editor.value, caret, typed);
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
    if (event.key !== "Backspace") last = null;
  });
  editor.addEventListener("pointerdown", () => {
    last = null;
  });
}
