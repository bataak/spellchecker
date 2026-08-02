import { unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";
import { applyRawEdits, planParagraph } from "../docx/edit.ts";
import { parsePart, SLIDE_VOCAB } from "../docx/parse.ts";
import type { ParagraphEdit, RawEdit, SkipReason } from "../docx/edit.ts";
import type { DocxPart, Paragraph } from "../docx/parse.ts";

export interface PptxDoc {
  entries: Record<string, Uint8Array>;
  order: string[];
  parts: DocxPart[];
  paragraphs: Paragraph[];
  starts: number[];
  text: string;
}

export interface PptxEdit {
  start: number;
  end: number;
  text: string;
}

export interface PptxSaveResult {
  bytes: Uint8Array<ArrayBuffer>;
  applied: PptxEdit[];
  skipped: Array<{ edit: PptxEdit; reason: SkipReason }>;
}

export const SLIDE_PARTS = /^ppt\/(slides|notesSlides)\/[a-zA-Z]+\d+\.xml$/;

const STORED_ENTRY =
  /\.(png|jpe?g|gif|bmp|tiff?|ico|emf|wmf|svgz|mp3|mp4|m4a|wav|avi|mov|zip|bin|thmx)$/i;

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

function slideOrder(names: string[]): string[] {
  const rank = (name: string): number =>
    name.startsWith("ppt/slides/") ? 0 : 1;
  const num = (name: string): number => {
    const match = /(\d+)\.xml$/.exec(name);
    return match === null ? 0 : Number.parseInt(match[1], 10);
  };

  return [...names].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    return byRank !== 0 ? byRank : num(left) - num(right);
  });
}

export function openPptx(bytes: Uint8Array): PptxDoc {
  const entries = unzipSync(bytes);
  const order = Object.keys(entries);
  const names = slideOrder(order.filter((name) => SLIDE_PARTS.test(name)));

  if (names.length === 0) throw new Error("ppt/slides not found");

  const parts: DocxPart[] = [];
  const paragraphs: Paragraph[] = [];
  const starts: number[] = [];
  let cursor = 0;

  for (const name of names) {
    const data = entries[name];
    if (data === undefined) continue;

    const part = parsePart(name, decoder.decode(data), SLIDE_VOCAB);
    parts.push(part);

    for (const paragraph of part.paragraphs) {
      starts.push(cursor);
      paragraphs.push(paragraph);
      cursor += paragraph.text.length + 2;
    }
  }

  return {
    entries,
    order,
    parts,
    paragraphs,
    starts,
    text: paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
  };
}

function findParagraph(doc: PptxDoc, offset: number): number {
  let low = 0;
  let high = doc.starts.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (doc.starts[mid] <= offset) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

export function renderPptxText(doc: PptxDoc, edits: PptxEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let result = doc.text;

  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > result.length || edit.start > edit.end)
      continue;
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
}

export function savePptx(doc: PptxDoc, edits: PptxEdit[]): PptxSaveResult {
  const buckets = new Map<
    number,
    Array<{ local: ParagraphEdit; source: PptxEdit }>
  >();
  const skipped: Array<{ edit: PptxEdit; reason: SkipReason }> = [];

  for (const edit of edits) {
    const found = findParagraph(doc, edit.start);

    if (found < 0) {
      skipped.push({ edit, reason: "not-found" });
      continue;
    }

    const paragraph = doc.paragraphs[found];
    const base = doc.starts[found];
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
  const applied: PptxEdit[] = [];

  for (const [found, bucket] of buckets) {
    const paragraph = doc.paragraphs[found];
    const plan = planParagraph(
      paragraph,
      bucket.map((item) => item.local),
    );

    const lookup = new Map<string, PptxEdit>();
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

  const entries: Record<string, Uint8Array> = { ...doc.entries };

  for (const part of doc.parts) {
    const raw = rawByPart.get(part.name);
    if (raw === undefined || raw.length === 0) continue;
    entries[part.name] = encoder.encode(applyRawEdits(part.xml, raw));
  }

  const zippable: Zippable = {};
  for (const name of doc.order) {
    const data = entries[name];
    if (data === undefined) continue;
    if (name.endsWith("/") && data.length === 0) continue;
    zippable[name] = [data, { level: STORED_ENTRY.test(name) ? 0 : 6 }];
  }

  return {
    bytes: zipSync(zippable) as Uint8Array<ArrayBuffer>,
    applied,
    skipped,
  };
}
