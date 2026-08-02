import { narrowEdit } from "./docx/edit.ts";
import type { ParagraphEdit } from "./docx/edit.ts";

export function lineDiff(
  oldText: string,
  newText: string,
): ParagraphEdit[] | null {
  if (oldText === newText) return [];

  const before = oldText.split("\n");
  const after = newText.split("\n");

  if (before.length !== after.length) return null;

  const spans: ParagraphEdit[] = [];
  let offset = 0;

  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) {
      spans.push(narrowEdit(before[index], after[index], offset));
    }
    offset += before[index].length + 1;
  }

  return spans;
}
