import type { TextEdit } from "./tokenshift.ts";

export interface EditorTextDeps {
  readonly editor: HTMLTextAreaElement;
  readonly onEdit: () => void;
  readonly onReplace: () => void;
  readonly accept: (old: string, next: string) => boolean;
  readonly onReplaced: () => void;
}

export interface EditorText {
  readonly set: (newText: string, caret: number | null) => TextEdit | null;
  readonly insert: (text: string, start: number, end: number) => void;
  readonly programmatic: () => boolean;
}

export function replaceRange(
  editor: HTMLTextAreaElement | HTMLInputElement,
  from: number,
  to: number,
  text: string,
): boolean {
  if (from === to && text === "") return true;
  try {
    editor.setSelectionRange(from, to);
  } catch (_) {}
  let ok = false;
  try {
    ok =
      text === ""
        ? document.execCommand("delete", false)
        : document.execCommand("insertText", false, text);
  } catch (_) {
    ok = false;
  }
  if (ok) return true;
  editor.setRangeText(text, from, to, "end");
  return false;
}

export function pasteComposed(
  editor: HTMLTextAreaElement,
  event: ClipboardEvent,
): boolean {
  const data = event.clipboardData;
  if (editor.readOnly || event.defaultPrevented) return false;
  if (!data || data.files.length) return false;
  const text = data.getData("text");
  const composed = text.normalize("NFC");
  if (composed === text) return false;
  event.preventDefault();
  if (
    !replaceRange(editor, editor.selectionStart, editor.selectionEnd, composed)
  )
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: composed,
      }),
    );
  return true;
}

export function initEditorText(deps: EditorTextDeps): EditorText {
  const { editor } = deps;
  let programmaticEdit = false;

  function set(newText: string, caret: number | null): TextEdit | null {
    deps.onEdit();
    deps.onReplace();
    const old = editor.value;
    if (old !== newText && !deps.accept(old, newText)) return null;
    editor.focus({ preventScroll: true });
    if (old === newText) {
      if (caret != null) {
        try {
          editor.setSelectionRange(caret, caret);
        } catch (_) {}
      }
      return null;
    }
    let commonPrefixLen = 0;
    const minLen = Math.min(old.length, newText.length);
    while (
      commonPrefixLen < minLen &&
      old.charCodeAt(commonPrefixLen) === newText.charCodeAt(commonPrefixLen)
    )
      commonPrefixLen++;
    let commonSuffixLen = 0;
    while (
      commonSuffixLen < minLen - commonPrefixLen &&
      old.charCodeAt(old.length - 1 - commonSuffixLen) ===
        newText.charCodeAt(newText.length - 1 - commonSuffixLen)
    )
      commonSuffixLen++;
    const oldEnd = old.length - commonSuffixLen;
    const slice = newText.slice(
      commonPrefixLen,
      newText.length - commonSuffixLen,
    );
    programmaticEdit = true;
    try {
      replaceRange(editor, commonPrefixLen, oldEnd, slice);
    } finally {
      programmaticEdit = false;
    }
    if (editor.value !== newText) editor.value = newText;
    if (caret != null) {
      try {
        editor.setSelectionRange(caret, caret);
      } catch (_) {}
    }
    deps.onReplaced();
    return {
      start: commonPrefixLen,
      oldEnd,
      newEnd: newText.length - commonSuffixLen,
    };
  }

  function insert(text: string, start: number, end: number): void {
    deps.onEdit();
    editor.focus({ preventScroll: true });
    programmaticEdit = true;
    try {
      replaceRange(editor, start, end, text);
    } finally {
      programmaticEdit = false;
    }
    deps.onReplaced();
  }

  return { set, insert, programmatic: () => programmaticEdit };
}
