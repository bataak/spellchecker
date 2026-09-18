export interface DictZip {
  chunkLength: number;
  sizes: Uint16Array;
  starts: Uint32Array;
  dataStart: number;
}

export type ReadBytes = (start: number, end: number) => Promise<Uint8Array>;

export type InflateRaw = (chunk: Uint8Array, limit: number) => Uint8Array;

const TERMINATOR = [1, 0, 0, 255, 255];

const FEXTRA = 4;
const FNAME = 8;
const FCOMMENT = 16;
const FHCRC = 2;

function skipZeroTerminated(bytes: Uint8Array, pos: number): number {
  const end = bytes.indexOf(0, pos);
  return end < 0 ? -1 : end + 1;
}

export function parseDictZip(head: Uint8Array): DictZip | null {
  if (head.length < 12) return null;
  if (head[0] !== 0x1f || head[1] !== 0x8b || head[2] !== 0x08) return null;
  const flags = head[3]!;
  if ((flags & FEXTRA) === 0) return null;

  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const extraLength = view.getUint16(10, true);
  let pos = 12;
  const extraEnd = pos + extraLength;
  if (extraEnd > head.length) return null;

  let field = -1;
  while (pos + 4 <= extraEnd) {
    const length = view.getUint16(pos + 2, true);
    if (head[pos] === 0x52 && head[pos + 1] === 0x41) {
      field = pos + 4;
      break;
    }
    pos += 4 + length;
  }
  if (field < 0 || field + 6 > extraEnd) return null;

  const version = view.getUint16(field, true);
  if (version !== 1) return null;
  const chunkLength = view.getUint16(field + 2, true);
  const count = view.getUint16(field + 4, true);
  if (chunkLength === 0 || field + 6 + count * 2 > extraEnd) return null;

  const sizes = new Uint16Array(count);
  const starts = new Uint32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = view.getUint16(field + 6 + i * 2, true);

  let after = extraEnd;
  if ((flags & FNAME) !== 0) after = skipZeroTerminated(head, after);
  if (after >= 0 && (flags & FCOMMENT) !== 0)
    after = skipZeroTerminated(head, after);
  if (after < 0) return null;
  if ((flags & FHCRC) !== 0) after += 2;
  if (after > head.length) return null;

  let at = after;
  for (let i = 0; i < count; i++) {
    starts[i] = at;
    at += sizes[i]!;
  }

  return { chunkLength, sizes, starts, dataStart: after };
}

export function terminate(chunk: Uint8Array): Uint8Array {
  const out = new Uint8Array(chunk.length + TERMINATOR.length);
  out.set(chunk, 0);
  out.set(TERMINATOR, chunk.length);
  return out;
}

export function chunkIndexAt(zip: DictZip, offset: number): number {
  return Math.floor(offset / zip.chunkLength);
}

export function inflatedLength(zip: DictZip): number {
  return zip.chunkLength * zip.sizes.length;
}

export function createDictZipReader(
  zip: DictZip,
  read: ReadBytes,
  inflate: InflateRaw,
  cacheSize = 3,
): (offset: number, size: number) => Promise<Uint8Array> {
  const cache = new Map<number, Uint8Array>();

  const chunkAt = async (index: number): Promise<Uint8Array> => {
    const hit = cache.get(index);
    if (hit) {
      cache.delete(index);
      cache.set(index, hit);
      return hit;
    }
    const start = zip.starts[index]!;
    const packed = await read(start, start + zip.sizes[index]!);
    const plain = inflate(terminate(packed), zip.chunkLength);
    cache.set(index, plain);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    return plain;
  };

  return async (offset: number, size: number): Promise<Uint8Array> => {
    if (size <= 0) return new Uint8Array(0);
    const first = chunkIndexAt(zip, offset);
    const last = chunkIndexAt(zip, offset + size - 1);
    if (first < 0 || last >= zip.sizes.length) throw new Error("dz: муж гадуур");
    const out = new Uint8Array(size);
    let filled = 0;
    for (let index = first; index <= last; index++) {
      const plain = await chunkAt(index);
      const base = index * zip.chunkLength;
      const from = Math.max(offset - base, 0);
      const to = Math.min(offset + size - base, plain.length);
      if (to <= from) continue;
      out.set(plain.subarray(from, to), filled);
      filled += to - from;
    }
    if (filled !== size) throw new Error("dz: дутуу уншилт");
    return out;
  };
}
