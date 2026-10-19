import { readZip, writeZip } from "../zip.ts";
import type { ZipPackage } from "../zip.ts";

export type DocxPackage = ZipPackage;

export function readPackage(bytes: Uint8Array): DocxPackage {
  return readZip(bytes, "word/document.xml");
}

export function writePackage(pkg: DocxPackage): Uint8Array<ArrayBuffer> {
  return writeZip(pkg);
}
