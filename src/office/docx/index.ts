import { parsePart } from "./parse.ts";
import { readPackage, writePackage } from "./package.ts";
import { applyEdits, buildIndex } from "../textdoc.ts";
import type { SaveResult, TextEdit, TextIndex } from "../textdoc.ts";
import type { DocxPart } from "./parse.ts";
import type { DocxPackage } from "./package.ts";

export interface DocxDoc extends TextIndex {
  pkg: DocxPackage;
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

export function saveDocx(doc: DocxDoc, edits: TextEdit[]): SaveResult {
  return applyEdits(doc.pkg, doc, edits, writePackage);
}
