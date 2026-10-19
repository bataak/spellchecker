import { applyRawEdits, planParagraph } from "./docx/edit.ts";
import type { ParagraphEdit, RawEdit, SkipReason } from "./docx/edit.ts";
import type { DocxPart, Paragraph } from "./docx/parse.ts";
import type { ZipPackage } from "./zip.ts";

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export interface SkippedEdit {
  edit: TextEdit;
  reason: SkipReason;
}

export interface TextIndex {
  parts: DocxPart[];
  paragraphs: Paragraph[];
  starts: number[];
  text: string;
}

export interface EditPlan {
  rawByPart: Map<string, RawEdit[]>;
  applied: TextEdit[];
  skipped: SkippedEdit[];
}

export interface SaveResult {
  bytes: Uint8Array<ArrayBuffer>;
  applied: TextEdit[];
  skipped: SkippedEdit[];
}

export function buildIndex(parts: DocxPart[], gap = 1): TextIndex {
  const paragraphs: Paragraph[] = [];
  const starts: number[] = [];
  let cursor = 0;

  for (const part of parts) {
    for (const paragraph of part.paragraphs) {
      starts.push(cursor);
      paragraphs.push(paragraph);
      cursor += paragraph.text.length + gap;
    }
  }

  return {
    parts,
    paragraphs,
    starts,
    text: paragraphs.map((paragraph) => paragraph.text).join("\n".repeat(gap)),
  };
}

function findParagraph(index: TextIndex, offset: number): number {
  let low = 0;
  let high = index.starts.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (index.starts[mid] <= offset) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

export function locate(
  index: TextIndex,
  offset: number,
): { paragraph: Paragraph; local: number } | null {
  const found = findParagraph(index, offset);
  if (found < 0) return null;

  const local = offset - index.starts[found];
  if (local > index.paragraphs[found].text.length) return null;

  return { paragraph: index.paragraphs[found], local };
}

export function renderFlat(source: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let result = source;

  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > result.length || edit.start > edit.end)
      continue;
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
}

interface Bucketed {
  local: ParagraphEdit;
  source: TextEdit;
}

function bucketEdits(
  index: TextIndex,
  edits: TextEdit[],
  skipped: SkippedEdit[],
): Map<number, Bucketed[]> {
  const buckets = new Map<number, Bucketed[]>();

  for (const edit of edits) {
    const found = findParagraph(index, edit.start);

    if (found < 0) {
      skipped.push({ edit, reason: "not-found" });
      continue;
    }

    const base = index.starts[found];
    const local: ParagraphEdit = {
      start: edit.start - base,
      end: edit.end - base,
      text: edit.text,
    };

    if (local.end > index.paragraphs[found].text.length) {
      skipped.push({ edit, reason: "crosses-boundary" });
      continue;
    }

    const bucket = buckets.get(found);
    if (bucket === undefined) buckets.set(found, [{ local, source: edit }]);
    else bucket.push({ local, source: edit });
  }

  return buckets;
}

const spanKey = (edit: { start: number; end: number }): string =>
  `${String(edit.start)}:${String(edit.end)}`;

export function planDocument(index: TextIndex, edits: TextEdit[]): EditPlan {
  const skipped: SkippedEdit[] = [];
  const buckets = bucketEdits(index, edits, skipped);
  const rawByPart = new Map<string, RawEdit[]>();
  const applied: TextEdit[] = [];

  for (const [found, bucket] of buckets) {
    const paragraph = index.paragraphs[found];
    const plan = planParagraph(
      paragraph,
      bucket.map((item) => item.local),
    );
    const lookup = new Map(
      bucket.map((item) => [spanKey(item.local), item.source]),
    );

    for (const item of plan.applied) {
      const source = lookup.get(spanKey(item));
      if (source !== undefined) applied.push(source);
    }

    for (const item of plan.skipped) {
      const source = lookup.get(spanKey(item.edit));
      if (source !== undefined)
        skipped.push({ edit: source, reason: item.reason });
    }

    if (plan.raw.length === 0) continue;

    const existing = rawByPart.get(paragraph.part);
    if (existing === undefined) rawByPart.set(paragraph.part, plan.raw);
    else existing.push(...plan.raw);
  }

  return { rawByPart, applied, skipped };
}

export function rewriteParts(
  parts: DocxPart[],
  plan: EditPlan,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const part of parts) {
    const raw = plan.rawByPart.get(part.name);
    if (raw === undefined || raw.length === 0) continue;
    result[part.name] = applyRawEdits(part.xml, raw);
  }

  return result;
}

const encoder = new TextEncoder();

export function applyEdits<P extends ZipPackage>(
  pkg: P,
  index: TextIndex,
  edits: TextEdit[],
  write: (pkg: P) => Uint8Array<ArrayBuffer>,
): SaveResult {
  const plan = planDocument(index, edits);
  const rewritten = rewriteParts(index.parts, plan);
  const entries: Record<string, Uint8Array> = { ...pkg.entries };

  for (const name of Object.keys(rewritten)) {
    entries[name] = encoder.encode(rewritten[name]);
  }

  return {
    bytes: write({ ...pkg, entries }),
    applied: plan.applied,
    skipped: plan.skipped,
  };
}
