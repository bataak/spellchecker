import { unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";

export interface DocxPackage {
  entries: Record<string, Uint8Array>;
  order: string[];
}

const STORED_ENTRY =
  /\.(png|jpe?g|gif|bmp|tiff?|ico|emf|wmf|svgz|mp3|mp4|m4a|wav|avi|mov|zip|docx|xlsx|pptx|bin|thmx)$/i;

export function readPackage(bytes: Uint8Array): DocxPackage {
  const entries = unzipSync(bytes);
  const order = Object.keys(entries);

  if (!Object.prototype.hasOwnProperty.call(entries, "word/document.xml")) {
    throw new Error("word/document.xml not found");
  }

  return { entries, order };
}

export function writePackage(pkg: DocxPackage): Uint8Array<ArrayBuffer> {
  const zippable: Zippable = {};

  for (const name of pkg.order) {
    const data = pkg.entries[name];
    if (data === undefined) continue;
    if (name.endsWith("/") && data.length === 0) continue;
    zippable[name] = [data, { level: STORED_ENTRY.test(name) ? 0 : 6 }];
  }

  return zipSync(zippable) as Uint8Array<ArrayBuffer>;
}

export function packageSize(pkg: DocxPackage): number {
  let total = 0;
  for (const name of pkg.order) {
    const data = pkg.entries[name];
    if (data !== undefined) total += data.length;
  }
  return total;
}
