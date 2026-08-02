import { applyRawEdits, planParagraph } from "./edit.ts";
import { parsePart } from "./parse.ts";
import { readPackage, writePackage } from "./package.ts";
import type { ParagraphEdit, RawEdit, SkipReason } from "./edit.ts";
import type { DocxPart, Paragraph } from "./parse.ts";
import type { DocxPackage } from "./package.ts";

export type { SkipReason } from "./edit.ts";
export type { DocxPart, Paragraph } from "./parse.ts";

export interface DocxEdit {
  start: number;
  end: number;
  text: string;
}

export interface DocxIndex {
  parts: DocxPart[];
  paragraphs: Paragraph[];
  starts: number[];
  text: string;
}

export interface DocxDoc extends DocxIndex {
  pkg: DocxPackage;
}

export interface SkippedDocxEdit {
  edit: DocxEdit;
  reason: SkipReason;
}

export interface DocxPlan {
  rawByPart: Map<string, RawEdit[]>;
  applied: DocxEdit[];
  skipped: SkippedDocxEdit[];
}

export interface DocxSaveResult {
  bytes: Uint8Array<ArrayBuffer>;
  applied: DocxEdit[];
  skipped: SkippedDocxEdit[];
}

export const TEXT_PARTS =
  /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/;

function partRank(name: string): number {
  if (name === "word/document.xml") return 0;
  if (name.startsWith("word/header")) return 1;
  if (name.startsWith("word/footer")) return 2;
  return 3;
}

export function orderParts(names: string[]): string[] {
  return [...names].sort((left, right) => {
    const rank = partRank(left) - partRank(right);
    return rank !== 0 ? rank : left.localeCompare(right);
  });
}

export const PARAGRAPH_GAP = 2;

export function buildIndex(parts: DocxPart[], gap = 1): DocxIndex {
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

export function readParts(pkg: DocxPackage): DocxPart[] {
  const decoder = new TextDecoder("utf-8");
  const names = orderParts(pkg.order.filter((name) => TEXT_PARTS.test(name)));
  const parts: DocxPart[] = [];

  for (const name of names) {
    const data = pkg.entries[name];
    if (data !== undefined) parts.push(parsePart(name, decoder.decode(data)));
  }

  return parts;
}

export function openDocx(bytes: Uint8Array): DocxDoc {
  const pkg = readPackage(bytes);
  return { pkg, ...buildIndex(readParts(pkg), PARAGRAPH_GAP) };
}

function findParagraph(index: DocxIndex, offset: number): number {
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
  index: DocxIndex,
  offset: number,
): { paragraph: Paragraph; local: number } | null {
  const found = findParagraph(index, offset);
  if (found < 0) return null;

  const local = offset - index.starts[found];
  if (local > index.paragraphs[found].text.length) return null;

  return { paragraph: index.paragraphs[found], local };
}

export function renderText(index: DocxIndex, edits: DocxEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let result = index.text;

  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > result.length || edit.start > edit.end)
      continue;
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
}

export function planDocument(index: DocxIndex, edits: DocxEdit[]): DocxPlan {
  const buckets = new Map<
    number,
    Array<{ local: ParagraphEdit; source: DocxEdit }>
  >();
  const skipped: SkippedDocxEdit[] = [];

  for (const edit of edits) {
    const found = findParagraph(index, edit.start);

    if (found < 0) {
      skipped.push({ edit, reason: "not-found" });
      continue;
    }

    const paragraph = index.paragraphs[found];
    const base = index.starts[found];
    const local: ParagraphEdit = {
      start: edit.start - base,
      end: edit.end - base,
      text: edit.text,
    };

    if (local.end > paragraph.text.length) {
      skipped.push({ edit, reason: "crosses-boundary" });
      continue;
    }

    const bucket = buckets.get(found);
    if (bucket === undefined) buckets.set(found, [{ local, source: edit }]);
    else bucket.push({ local, source: edit });
  }

  const rawByPart = new Map<string, RawEdit[]>();
  const applied: DocxEdit[] = [];

  for (const [found, bucket] of buckets) {
    const paragraph = index.paragraphs[found];
    const plan = planParagraph(
      paragraph,
      bucket.map((item) => item.local),
    );

    const lookup = new Map<string, DocxEdit>();
    for (const item of bucket) {
      lookup.set(
        `${String(item.local.start)}:${String(item.local.end)}`,
        item.source,
      );
    }

    for (const item of plan.applied) {
      const source = lookup.get(`${String(item.start)}:${String(item.end)}`);
      if (source !== undefined) applied.push(source);
    }

    for (const item of plan.skipped) {
      const source = lookup.get(
        `${String(item.edit.start)}:${String(item.edit.end)}`,
      );
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
  plan: DocxPlan,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const part of parts) {
    const raw = plan.rawByPart.get(part.name);
    if (raw === undefined || raw.length === 0) continue;
    result[part.name] = applyRawEdits(part.xml, raw);
  }

  return result;
}

export function saveDocx(doc: DocxDoc, edits: DocxEdit[]): DocxSaveResult {
  const plan = planDocument(doc, edits);
  const rewritten = rewriteParts(doc.parts, plan);
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = { ...doc.pkg.entries };

  for (const name of Object.keys(rewritten)) {
    entries[name] = encoder.encode(rewritten[name]);
  }

  return {
    bytes: writePackage({ entries, order: doc.pkg.order }),
    applied: plan.applied,
    skipped: plan.skipped,
  };
}
