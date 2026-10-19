import { parsePart, SLIDE_VOCAB } from "../docx/parse.ts";
import { applyEdits, buildIndex } from "../textdoc.ts";
import type { SaveResult, TextEdit, TextIndex } from "../textdoc.ts";
import { readZip, writeZip } from "../zip.ts";
import type { ZipPackage } from "../zip.ts";
import type { DocxPart } from "../docx/parse.ts";

export interface PptxDoc extends TextIndex {
  pkg: ZipPackage;
}

export const SLIDE_PARTS = /^ppt\/(slides|notesSlides)\/[a-zA-Z]+\d+\.xml$/;

const decoder = new TextDecoder("utf-8");

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
  const pkg = readZip(bytes);
  const names = slideOrder(pkg.order.filter((name) => SLIDE_PARTS.test(name)));

  if (names.length === 0) throw new Error("ppt/slides not found");

  const parts: DocxPart[] = [];
  for (const name of names) {
    const data = pkg.entries[name];
    if (data !== undefined)
      parts.push(parsePart(name, decoder.decode(data), SLIDE_VOCAB));
  }

  return { pkg, ...buildIndex(parts, 2) };
}

export function savePptx(doc: PptxDoc, edits: TextEdit[]): SaveResult {
  return applyEdits(doc.pkg, doc, edits, (pkg) => writeZip(pkg));
}
