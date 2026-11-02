import { lineDiff } from "./linediff.ts";
import { renderFlat } from "./textdoc.ts";
import type { TextEdit } from "./textdoc.ts";

interface Placed {
  edit: TextEdit;
  renderStart: number;
  renderEnd: number;
}

function netLength(edit: TextEdit): number {
  return edit.text.length - (edit.end - edit.start);
}

export function applyEdit(
  source: string,
  edits: readonly TextEdit[],
  start: number,
  end: number,
  text: string,
): TextEdit[] {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  const before: TextEdit[] = [];
  const after: TextEdit[] = [];
  const touched: Placed[] = [];
  let headShift = 0;
  let tailShift = 0;

  for (const edit of ordered) {
    const renderStart = edit.start + tailShift;
    const renderEnd = renderStart + edit.text.length;
    if (renderEnd < start) {
      before.push(edit);
      headShift += netLength(edit);
    } else if (renderStart > end) {
      after.push(edit);
      continue;
    } else {
      touched.push({ edit, renderStart, renderEnd });
    }
    tailShift += netLength(edit);
  }

  const first = touched[0];
  const last = touched[touched.length - 1];
  const startsInside = first !== undefined && start >= first.renderStart;
  const endsInside = last !== undefined && end <= last.renderEnd;
  const merged: TextEdit = {
    start: startsInside ? first.edit.start : start - headShift,
    end: endsInside ? last.edit.end : end - tailShift,
    text:
      (startsInside
        ? first.edit.text.slice(0, start - first.renderStart)
        : "") +
      text +
      (endsInside ? last.edit.text.slice(end - last.renderStart) : ""),
  };
  const unchanged = source.slice(merged.start, merged.end) === merged.text;
  return [...before, ...(unchanged ? [] : [merged]), ...after];
}

export function syncEdits(
  source: string,
  edits: readonly TextEdit[],
  oldText: string,
  newText: string,
): TextEdit[] | null {
  const spans = lineDiff(oldText, newText);
  if (spans === null) return null;
  if (renderFlat(source, [...edits]) !== oldText) return null;

  let next = [...edits];
  for (const span of [...spans].sort((l, r) => r.start - l.start))
    next = applyEdit(source, next, span.start, span.end, span.text);

  return renderFlat(source, next) === newText ? next : null;
}
