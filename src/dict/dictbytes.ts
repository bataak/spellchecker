import {
  createDictZipReader,
  parseDictZip,
  type InflateRaw,
  type ReadBytes,
} from "./dictzip.ts";

export interface DictBytes {
  size: number;
  read(offset: number, size: number): Promise<Uint8Array>;
}

export function memoryBytes(bytes: Uint8Array): DictBytes {
  return {
    size: bytes.length,
    read(offset: number, size: number): Promise<Uint8Array> {
      return Promise.resolve(bytes.subarray(offset, offset + size));
    },
  };
}

export function rangeBytes(size: number, read: ReadBytes): DictBytes {
  return {
    size,
    read(offset: number, length: number): Promise<Uint8Array> {
      return read(offset, offset + length);
    },
  };
}

export function blobReader(blob: Blob): ReadBytes {
  return async (start: number, end: number): Promise<Uint8Array> =>
    new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export function isizeOf(tail: Uint8Array): number {
  if (tail.length < 4) return 0;
  const at = tail.length - 4;
  return (
    (tail[at]! |
      (tail[at + 1]! << 8) |
      (tail[at + 2]! << 16) |
      (tail[at + 3]! << 24)) >>>
    0
  );
}

export async function openDictBytes(
  read: ReadBytes,
  fileSize: number,
  inflate: InflateRaw,
  headSize = 65536,
): Promise<DictBytes> {
  const head = await read(0, Math.min(headSize, fileSize));
  const zip = parseDictZip(head);
  if (!zip) return rangeBytes(fileSize, read);
  const size = isizeOf(await read(Math.max(fileSize - 4, 0), fileSize));
  const chunked = createDictZipReader(zip, read, inflate);
  return {
    size: size || zip.chunkLength * zip.sizes.length,
    read: chunked,
  };
}
