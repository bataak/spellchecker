import { unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";

export interface ZipPackage {
  entries: Record<string, Uint8Array>;
  order: string[];
}

const STORED_ENTRY =
  /\.(png|jpe?g|gif|bmp|tiff?|ico|emf|wmf|svgz|mp3|mp4|m4a|wav|avi|mov|zip|docx|xlsx|pptx|bin|thmx)$/i;

export function readZip(bytes: Uint8Array, required?: string): ZipPackage {
  const entries = unzipSync(bytes);
  if (
    required !== undefined &&
    !Object.prototype.hasOwnProperty.call(entries, required)
  ) {
    throw new Error(required + " not found");
  }
  return { entries, order: Object.keys(entries) };
}

export function writeZip(
  pkg: ZipPackage,
  first?: string,
): Uint8Array<ArrayBuffer> {
  const zippable: Zippable = {};
  const lead = first === undefined ? undefined : pkg.entries[first];

  if (first !== undefined && lead !== undefined)
    zippable[first] = [lead, { level: 0 }];

  for (const name of pkg.order) {
    if (name === first) continue;
    const data = pkg.entries[name];
    if (data === undefined) continue;
    if (name.endsWith("/") && data.length === 0) continue;
    zippable[name] = [data, { level: STORED_ENTRY.test(name) ? 0 : 6 }];
  }

  return zipSync(zippable) as Uint8Array<ArrayBuffer>;
}
