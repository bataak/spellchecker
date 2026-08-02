import { unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";
import { applyRawEdits, planParagraph } from "../docx/edit.ts";
import { parseOdfPart } from "./parse.ts";
import type { ParagraphEdit, RawEdit, SkipReason } from "../docx/edit.ts";
import type { DocxPart, Paragraph } from "../docx/parse.ts";

export interface OdfPackage {
  entries: Record<string, Uint8Array>;
  order: string[];
  mimetype: string;
}

export interface OdfDoc {
  pkg: OdfPackage;
  parts: DocxPart[];
  paragraphs: Paragraph[];
  starts: number[];
  text: string;
}

export interface OdfEdit {
  start: number;
  end: number;
  text: string;
}

export interface OdfSaveResult {
  bytes: Uint8Array<ArrayBuffer>;
  applied: OdfEdit[];
  skipped: Array<{ edit: OdfEdit; reason: SkipReason }>;
}

export const ODF_TEXT = "application/vnd.oasis.opendocument.text";
export const ODF_PRESENTATION =
  "application/vnd.oasis.opendocument.presentation";

const STORED_ENTRY =
  /\.(png|jpe?g|gif|bmp|tiff?|ico|emf|wmf|svgz|mp3|mp4|m4a|wav|avi|mov|zip|bin)$/i;

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

export function readOdf(bytes: Uint8Array): OdfPackage {
  const entries = unzipSync(bytes);
  const order = Object.keys(entries);

  if (!Object.prototype.hasOwnProperty.call(entries, "content.xml")) {
    throw new Error("content.xml not found");
  }

  const raw = entries["mimetype"];
  return {
    entries,
    order,
    mimetype: raw === undefined ? "" : decoder.decode(raw),
  };
}

export function writeOdf(pkg: OdfPackage): Uint8Array<ArrayBuffer> {
  const zippable: Zippable = {};
  const mime = pkg.entries["mimetype"];

  if (mime !== undefined) zippable["mimetype"] = [mime, { level: 0 }];

  for (const name of pkg.order) {
    if (name === "mimetype") continue;
    const data = pkg.entries[name];
    if (data === undefined) continue;
    if (name.endsWith("/") && data.length === 0) continue;
    zippable[name] = [data, { level: STORED_ENTRY.test(name) ? 0 : 6 }];
  }

  return zipSync(zippable) as Uint8Array<ArrayBuffer>;
}

export function buildOdfIndex(parts: DocxPart[], gap = 2): Omit<OdfDoc, "pkg"> {
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

export function openOdf(bytes: Uint8Array): OdfDoc {
  const pkg = readOdf(bytes);
  const parts = [
    parseOdfPart("content.xml", decoder.decode(pkg.entries["content.xml"])),
  ];
  return { pkg, ...buildOdfIndex(parts) };
}

function findParagraph(doc: Omit<OdfDoc, "pkg">, offset: number): number {
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

export function renderOdfText(
  doc: Omit<OdfDoc, "pkg">,
  edits: OdfEdit[],
): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let result = doc.text;

  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > result.length || edit.start > edit.end)
      continue;
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
}

export function saveOdf(doc: OdfDoc, edits: OdfEdit[]): OdfSaveResult {
  const buckets = new Map<
    number,
    Array<{ local: ParagraphEdit; source: OdfEdit }>
  >();
  const skipped: Array<{ edit: OdfEdit; reason: SkipReason }> = [];

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
  const applied: OdfEdit[] = [];

  for (const [found, bucket] of buckets) {
    const paragraph = doc.paragraphs[found];
    const plan = planParagraph(
      paragraph,
      bucket.map((item) => item.local),
    );

    const lookup = new Map<string, OdfEdit>();
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

  const entries: Record<string, Uint8Array> = { ...doc.pkg.entries };

  for (const part of doc.parts) {
    const raw = rawByPart.get(part.name);
    if (raw === undefined || raw.length === 0) continue;
    entries[part.name] = encoder.encode(applyRawEdits(part.xml, raw));
  }

  return {
    bytes: writeOdf({ ...doc.pkg, entries }),
    applied,
    skipped,
  };
}
