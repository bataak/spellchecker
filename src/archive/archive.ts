import { fflate, gunzipped, MAX_UNPACKED, TOO_LARGE } from "./fflate.ts";
import { untar, type ArchiveEntry } from "./tar.ts";

const ZIP = /\.zip$/i;
const TAR = /\.tar$/i;
const TAR_GZ = /\.(tar\.gz|tgz)$/i;
const TAR_BZ2 = /\.(tar\.bz2|tbz2?|tb2)$/i;

export function isArchiveName(name: string): boolean {
  return (
    ZIP.test(name) || TAR.test(name) || TAR_GZ.test(name) || TAR_BZ2.test(name)
  );
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function isJunkEntry(path: string): boolean {
  return path.startsWith("__MACOSX/") || baseName(path).startsWith("._");
}

export async function unpackedSize(bytes: Uint8Array): Promise<number> {
  const { unzipSync } = await fflate();
  let total = 0;
  unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      return false;
    },
  });
  return total;
}

export async function extractArchive(
  name: string,
  bytes: Uint8Array,
  limit = MAX_UNPACKED,
): Promise<ArchiveEntry[]> {
  if (ZIP.test(name)) {
    if ((await unpackedSize(bytes)) > limit) throw new Error(TOO_LARGE);
    return Object.entries((await fflate()).unzipSync(bytes))
      .filter(([path]) => !path.endsWith("/"))
      .map(([path, data]) => ({ name: path, data }));
  }
  if (TAR_GZ.test(name)) return untar(await gunzipped(bytes, limit));
  if (TAR_BZ2.test(name)) {
    const { bunzip2 } = await import("./bzip2.ts");
    return untar(bunzip2(bytes, limit));
  }
  if (TAR.test(name)) return untar(bytes);
  throw new Error("Архивын төрөл танигдсангүй: " + name);
}
