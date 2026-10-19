import { readZip, writeZip } from "../zip.ts";
import type { ZipPackage } from "../zip.ts";
import { applyEdits, buildIndex } from "../textdoc.ts";
import type { SaveResult, TextEdit, TextIndex } from "../textdoc.ts";
import { parseOdfPart } from "./parse.ts";

export interface OdfPackage extends ZipPackage {
  mimetype: string;
}

export interface OdfDoc extends TextIndex {
  pkg: OdfPackage;
}

export const ODF_TEXT = "application/vnd.oasis.opendocument.text";
export const ODF_PRESENTATION =
  "application/vnd.oasis.opendocument.presentation";

export function manifestXml(
  mimetype: string,
  parts: readonly string[],
  pictures: readonly string[],
): string {
  const entry = (path: string, type: string): string =>
    '<manifest:file-entry manifest:full-path="' +
    path +
    '" manifest:media-type="' +
    type +
    '"/>';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"' +
    ' manifest:version="1.3">' +
    entry("/", mimetype) +
    parts.map((path) => entry(path, "text/xml")).join("") +
    pictures
      .map((path) =>
        entry(path, "image/" + path.slice(path.lastIndexOf(".") + 1)),
      )
      .join("") +
    "</manifest:manifest>"
  );
}

const decoder = new TextDecoder("utf-8");

export function readOdf(bytes: Uint8Array): OdfPackage {
  const { entries, order } = readZip(bytes, "content.xml");
  const raw = entries["mimetype"];
  return {
    entries,
    order,
    mimetype: raw === undefined ? "" : decoder.decode(raw),
  };
}

export function writeOdf(pkg: OdfPackage): Uint8Array<ArrayBuffer> {
  return writeZip(pkg, "mimetype");
}

export function openOdf(bytes: Uint8Array): OdfDoc {
  const pkg = readOdf(bytes);
  const parts = [
    parseOdfPart("content.xml", decoder.decode(pkg.entries["content.xml"])),
  ];
  return { pkg, ...buildIndex(parts, 2) };
}

export function saveOdf(doc: OdfDoc, edits: TextEdit[]): SaveResult {
  return applyEdits(doc.pkg, doc, edits, writeOdf);
}
