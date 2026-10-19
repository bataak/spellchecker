import { attempt } from "./attempt.ts";
import { isSeparatorInput } from "./input.ts";
import { standardLetters } from "./spell/letters.ts";
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

export type SwapOrigin = "slot" | "project" | "office" | "restore";

export interface SwapOptions {
  readonly origin: SwapOrigin;
  readonly start?: number;
  readonly end?: number;
  readonly notify?: boolean;
}

const swapEvents = new WeakMap<Event, SwapOrigin>();
const swapHooks = new Set<(origin: SwapOrigin) => void>();

export function onSwap(hook: (origin: SwapOrigin) => void): () => void {
  swapHooks.add(hook);
  return () => swapHooks.delete(hook);
}

export function swapOrigin(event: Event): SwapOrigin | null {
  return swapEvents.get(event) ?? null;
}

export function swapText(
  editor: HTMLTextAreaElement,
  text: string,
  options: SwapOptions,
): void {
  for (const hook of swapHooks) hook(options.origin);
  editor.value = "";
  editor.value = text;
  if (options.start !== undefined)
    editor.setSelectionRange(options.start, options.end ?? options.start);
  if (options.notify === false) return;
  const event = new InputEvent("input", {
    bubbles: true,
    inputType: "insertReplacementText",
  });
  swapEvents.set(event, options.origin);
  editor.dispatchEvent(event);
}

export function replaceRange(
  editor: HTMLTextAreaElement | HTMLInputElement,
  from: number,
  to: number,
  text: string,
): boolean {
  if (from === to && text === "") return true;
  editor.setSelectionRange(from, to);
  const ok = attempt(
    () =>
      text === ""
        ? document.execCommand("delete", false)
        : document.execCommand("insertText", false, text),
    false,
  );
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
  const composed = standardLetters(text);
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

const TRAILING_WORD = /[\p{L}\p{M}]+$/u;
const WORD_REACH = 256;

export function composeTypedWord(
  editor: HTMLTextAreaElement,
  event: InputEvent,
): boolean {
  if (editor.readOnly || event.isComposing || !isSeparatorInput(event))
    return false;
  if (event.inputType.startsWith("insertFrom")) return false;
  const caret = editor.selectionStart;
  if (caret !== editor.selectionEnd) return false;
  const typed =
    event.inputType === "insertText" ? (event.data?.length ?? 0) : 1;
  const end = caret - typed;
  if (end <= 0) return false;
  const word = TRAILING_WORD.exec(
    editor.value.slice(Math.max(0, end - WORD_REACH), end),
  )?.[0];
  if (!word) return false;
  const composed = standardLetters(word);
  if (composed === word) return false;
  replaceRange(editor, end - word.length, end, composed);
  const next = caret - word.length + composed.length;
  editor.setSelectionRange(next, next);
  return true;
}

export function composeDropped(
  editor: HTMLTextAreaElement,
  event: InputEvent,
): boolean {
  if (editor.readOnly || event.inputType !== "insertFromDrop") return false;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const dropped = editor.value.slice(start, end);
  const composed = standardLetters(dropped);
  if (start === end || composed === dropped) return false;
  replaceRange(editor, start, end, composed);
  editor.setSelectionRange(start, start + composed.length);
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
        editor.setSelectionRange(caret, caret);
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
      editor.setSelectionRange(caret, caret);
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
