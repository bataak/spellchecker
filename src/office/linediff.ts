import { narrowEdit } from "./docx/edit.ts";
import type { ParagraphEdit } from "./docx/edit.ts";

function spanEdits(
  before: string,
  after: string,
  offset: number,
): ParagraphEdit[] {
  const edits: ParagraphEdit[] = [];
  let index = 0;

  while (index < before.length) {
    if (before[index] === after[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < before.length && before[index] !== after[index]) {
      index += 1;
    }
    edits.push({
      start: offset + start,
      end: offset + index,
      text: after.slice(start, index),
    });
  }

  return edits;
}

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
      if (before[index].length === after[index].length) {
        spans.push(...spanEdits(before[index], after[index], offset));
      } else {
        spans.push(narrowEdit(before[index], after[index], offset));
      }
    }
    offset += before[index].length + 1;
  }

  return spans;
}
