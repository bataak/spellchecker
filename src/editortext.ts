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
    try {
      editor.setSelectionRange(commonPrefixLen, oldEnd);
    } catch (_) {}
    let ok = false;
    programmaticEdit = true;
    try {
      ok =
        slice === ""
          ? document.execCommand("delete", false)
          : document.execCommand("insertText", false, slice);
    } catch (_) {
      ok = false;
    }
    programmaticEdit = false;
    if (!ok || editor.value !== newText) editor.value = newText;
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
    try {
      editor.setSelectionRange(start, end);
    } catch (_) {}
    let ok = false;
    programmaticEdit = true;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (_) {
      ok = false;
    }
    programmaticEdit = false;
    if (!ok) {
      const editorText = editor.value;
      editor.value = editorText.slice(0, start) + text + editorText.slice(end);
      const pos = start + text.length;
      try {
        editor.setSelectionRange(pos, pos);
      } catch (_) {}
    }
  }

  return { set, insert, programmatic: () => programmaticEdit };
}
