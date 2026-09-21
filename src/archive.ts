import { gunzipSync, unzipSync } from "fflate";
import { untar, type ArchiveEntry } from "./tar.ts";

const ZIP = /\.zip$/i;
const TAR = /\.tar$/i;
const TAR_GZ = /\.(tar\.gz|tgz)$/i;
const TAR_BZ2 = /\.(tar\.bz2|tbz2?|tb2)$/i;

export function isArchiveName(name: string): boolean {
  return ZIP.test(name) || TAR.test(name) || TAR_GZ.test(name) || TAR_BZ2.test(name);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function isJunkEntry(path: string): boolean {
  return path.startsWith("__MACOSX/") || baseName(path).startsWith("._");
}

export async function extractArchive(
  name: string,
  bytes: Uint8Array,
): Promise<ArchiveEntry[]> {
  if (ZIP.test(name))
    return Object.entries(unzipSync(bytes))
      .filter(([path]) => !path.endsWith("/"))
      .map(([path, data]) => ({ name: path, data }));
  if (TAR_GZ.test(name)) return untar(gunzipSync(bytes));
  if (TAR_BZ2.test(name)) {
    const { bunzip2 } = await import("./bzip2.ts");
    return untar(bunzip2(bytes));
  }
  if (TAR.test(name)) return untar(bytes);
  throw new Error("Архивын төрөл танигдсангүй: " + name);
}
