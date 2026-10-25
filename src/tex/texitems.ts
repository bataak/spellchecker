import { replaceRange } from "../editor/editortext.ts";

const LIST = /\\(begin|end)\{(itemize|enumerate|description)\}/g;
const ITEM = /^([ \t]*)\\item\b/;
const INDENT = "  ";
const COMMENT = /(^|[^\\])((?:\\\\)*)%.*$/gm;

export interface ItemEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly caret: number;
}

function withoutComments(text: string): string {
  return text.replace(
    COMMENT,
    (match, lead: string, slashes: string) =>
      lead + slashes + " ".repeat(match.length - lead.length - slashes.length),
  );
}

function listStart(before: string): number | null {
  const open: number[] = [];
  for (const match of before.matchAll(LIST)) {
    if (match[1] === "begin") open.push(match.index + match[0].length);
    else open.pop();
  }
  return open.at(-1) ?? null;
}

function lineAt(text: string, at: number): string {
  const start = text.lastIndexOf("\n", at - 1) + 1;
  const end = text.indexOf("\n", at);
  return text.slice(start, end < 0 ? text.length : end);
}

function depthChange(line: string): number {
  let change = 0;
  for (const match of line.matchAll(LIST))
    change += match[1] === "begin" ? 1 : -1;
  return change;
}

function itemIndent(text: string, start: number, caret: number): string {
  let indent = /^[ \t]*/.exec(lineAt(text, start))![0] + INDENT;
  let depth = 0;
  for (const line of text.slice(start, caret).split("\n")) {
    const match = depth === 0 ? ITEM.exec(line) : null;
    if (match) indent = match[1]!;
    depth += depthChange(line);
  }
  return indent;
}

export function itemEdit(
  text: string,
  from: number,
  to: number,
): ItemEdit | null {
  const before = withoutComments(text.slice(0, from));
  const start = listStart(before);
  if (start === null) return null;
  const insert = "\n" + itemIndent(before, start, from) + "\\item ";
  return { from, to, insert, caret: from + insert.length };
}

export interface TexItemsDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
}

export function initTexItems(deps: TexItemsDeps): void {
  const { editor } = deps;
  editor.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.altKey || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.defaultPrevented || editor.readOnly || !deps.active()) return;
    const edit = itemEdit(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
    );
    if (!edit) return;
    event.preventDefault();
    replaceRange(editor, edit.from, edit.to, edit.insert);
    editor.setSelectionRange(edit.caret, edit.caret);
  });
}
