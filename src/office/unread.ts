import { scanXml } from "./docx/xml.ts";
import type { DocxPart } from "./docx/parse.ts";
import { PARAGRAPHS, SKIPPED_ELEMENTS } from "./odf/parse.ts";
import type { OdfPackage } from "./odf/index.ts";

export type UnreadKind = "notes" | "headers" | "boxes" | "diagrams";

type Path = readonly string[];

const KIND_ORDER: readonly UnreadKind[] = [
  "notes",
  "headers",
  "boxes",
  "diagrams",
];

const HAS_WORD = /\p{L}/u;

const ODF_HEADERS = new Set([
  "style:header",
  "style:header-left",
  "style:header-first",
  "style:footer",
  "style:footer-left",
  "style:footer-first",
]);

const EMBEDDED_PART =
  /^(?:ppt|word)\/(?:charts\/chart|diagrams\/data)\d+\.xml$/;

const decoder = new TextDecoder("utf-8");

function collectWords(xml: string, visit: (path: Path) => void): void {
  const path: string[] = [];
  scanXml(
    xml,
    (tag) => {
      if (tag.kind === "open") path.push(tag.name);
      else if (tag.kind === "close") path.pop();
    },
    (_start, _end, text) => {
      if (HAS_WORD.test(text)) visit(path);
    },
  );
}

function ordered(found: ReadonlySet<UnreadKind>): UnreadKind[] {
  return KIND_ORDER.filter((kind) => found.has(kind));
}

function hasEmbeddedText(
  entries: Readonly<Record<string, Uint8Array>>,
): boolean {
  let found = false;
  for (const name of Object.keys(entries)) {
    if (found || !EMBEDDED_PART.test(name)) continue;
    collectWords(decoder.decode(entries[name]), (path) => {
      const leaf = path.at(-1);
      if (leaf === "a:t" || (leaf === "c:v" && path.includes("c:strCache")))
        found = true;
    });
  }
  return found;
}

export function pptxUnread(
  entries: Readonly<Record<string, Uint8Array>>,
): UnreadKind[] {
  return hasEmbeddedText(entries) ? ["diagrams"] : [];
}

export function docxUnread(
  parts: readonly DocxPart[],
  entries: Readonly<Record<string, Uint8Array>>,
): UnreadKind[] {
  const found = new Set<UnreadKind>(pptxUnread(entries));
  for (const part of parts)
    collectWords(part.xml, (path) => {
      if (path.at(-1) === "w:t" && path.includes("w:txbxContent"))
        found.add("boxes");
    });
  return ordered(found);
}

function odfContentKind(path: Path): UnreadKind | null {
  if (path.some((name) => SKIPPED_ELEMENTS.has(name))) return null;
  if (path.includes("text:note-body")) return "notes";
  const depth = path.filter((name) => PARAGRAPHS.has(name)).length;
  return depth > 1 ? "boxes" : null;
}

export function odfUnread(pkg: OdfPackage): UnreadKind[] {
  const found = new Set<UnreadKind>();
  const content = pkg.entries["content.xml"];
  const styles = pkg.entries["styles.xml"];
  if (content !== undefined)
    collectWords(decoder.decode(content), (path) => {
      const kind = odfContentKind(path);
      if (kind !== null) found.add(kind);
    });
  if (styles !== undefined)
    collectWords(decoder.decode(styles), (path) => {
      if (path.some((name) => ODF_HEADERS.has(name))) found.add("headers");
    });
  return ordered(found);
}
