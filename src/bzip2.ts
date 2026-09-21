const BLOCK_MAGIC_HI = 0x314159;
const BLOCK_MAGIC_LO = 0x265359;
const END_MAGIC_HI = 0x177245;
const END_MAGIC_LO = 0x385090;
const RUNA = 0;
const RUNB = 1;
const GROUP_SIZE = 50;
const MAX_CODE_LEN = 20;
const MAX_GROUPS = 6;
const MAX_ALPHA = 258;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++)
      c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    table[i] = c >>> 0;
  }
  return table;
})();

class ByteSink {
  private buffer = new Uint8Array(1 << 16);
  length = 0;

  push(byte: number): void {
    if (this.length === this.buffer.length) {
      const grown = new Uint8Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer[this.length++] = byte;
  }

  bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

class BitReader {
  private pos = 0;
  private bit = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      if (this.pos >= this.bytes.length) throw new Error("bzip2: өгөгдөл дутуу");
      value = (value << 1) | ((this.bytes[this.pos]! >> (7 - this.bit)) & 1);
      if (++this.bit === 8) {
        this.bit = 0;
        this.pos++;
      }
    }
    return value >>> 0;
  }

  alignToByte(): void {
    if (this.bit) {
      this.bit = 0;
      this.pos++;
    }
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }
}

interface HuffmanTable {
  limit: Int32Array;
  base: Int32Array;
  perm: Int32Array;
  minLen: number;
}

function buildTable(lengths: Uint8Array, alphaSize: number): HuffmanTable {
  let minLen = 32;
  let maxLen = 0;
  for (let i = 0; i < alphaSize; i++) {
    minLen = Math.min(minLen, lengths[i]!);
    maxLen = Math.max(maxLen, lengths[i]!);
  }
  const perm = new Int32Array(MAX_ALPHA);
  const base = new Int32Array(MAX_CODE_LEN + 2);
  const limit = new Int32Array(MAX_CODE_LEN + 2).fill(-1);
  let pp = 0;
  for (let len = minLen; len <= maxLen; len++)
    for (let sym = 0; sym < alphaSize; sym++)
      if (lengths[sym] === len) perm[pp++] = sym;
  for (let sym = 0; sym < alphaSize; sym++) base[lengths[sym]! + 1]!++;
  for (let i = 1; i < base.length; i++) base[i]! += base[i - 1]!;
  let vec = 0;
  for (let len = minLen; len <= maxLen; len++) {
    vec += base[len + 1]! - base[len]!;
    limit[len] = vec - 1;
    vec <<= 1;
  }
  for (let len = minLen + 1; len <= maxLen; len++)
    base[len] = ((limit[len - 1]! + 1) << 1) - base[len]!;
  return { limit, base, perm, minLen };
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  let len = table.minLen;
  let code = reader.read(len);
  while (len <= MAX_CODE_LEN && code > table.limit[len]!) {
    len++;
    code = (code << 1) | reader.read(1);
  }
  if (len > MAX_CODE_LEN) throw new Error("bzip2: Хаффманы код буруу");
  return table.perm[code - table.base[len]!]!;
}

function decodeBlock(
  reader: BitReader,
  blockSize: number,
  out: ByteSink,
): void {
  const expectedCrc = reader.read(32);
  if (reader.read(1)) throw new Error("bzip2: randomised блок дэмжигдэхгүй");
  const origPtr = reader.read(24);

  const used = reader.read(16);
  const seqToUnseq: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (!(used & (0x8000 >> i))) continue;
    const bits = reader.read(16);
    for (let j = 0; j < 16; j++)
      if (bits & (0x8000 >> j)) seqToUnseq.push(i * 16 + j);
  }
  if (!seqToUnseq.length) throw new Error("bzip2: тэмдэгтийн жагсаалт хоосон");
  const alphaSize = seqToUnseq.length + 2;

  const groupCount = reader.read(3);
  if (groupCount < 2 || groupCount > MAX_GROUPS)
    throw new Error("bzip2: бүлгийн тоо буруу");
  const selectorCount = reader.read(15);
  if (!selectorCount) throw new Error("bzip2: selector алга");
  const groupOrder = Array.from({ length: groupCount }, (_, i) => i);
  const selectors = new Uint8Array(selectorCount);
  for (let i = 0; i < selectorCount; i++) {
    let j = 0;
    while (reader.read(1)) {
      if (++j >= groupCount) throw new Error("bzip2: selector буруу");
    }
    const group = groupOrder[j]!;
    groupOrder.splice(j, 1);
    groupOrder.unshift(group);
    selectors[i] = group;
  }

  const tables: HuffmanTable[] = [];
  for (let g = 0; g < groupCount; g++) {
    const lengths = new Uint8Array(alphaSize);
    let len = reader.read(5);
    for (let sym = 0; sym < alphaSize; sym++) {
      while (reader.read(1)) len += reader.read(1) ? -1 : 1;
      if (len < 1 || len > MAX_CODE_LEN) throw new Error("bzip2: кодын урт буруу");
      lengths[sym] = len;
    }
    tables.push(buildTable(lengths, alphaSize));
  }

  const endOfBlock = alphaSize - 1;
  const counts = new Int32Array(256);
  const tt = new Uint32Array(blockSize);
  const mtf = seqToUnseq.map((_, i) => i);
  let length = 0;
  let selectorIndex = 0;
  let groupLeft = 0;
  let table = tables[0]!;
  let run = 0;
  let runWeight = 1;

  const flushRun = (): void => {
    if (!run) return;
    const byte = seqToUnseq[mtf[0]!]!;
    if (length + run > blockSize) throw new Error("bzip2: блок хэт урт");
    counts[byte]! += run;
    tt.fill(byte, length, length + run);
    length += run;
    run = 0;
    runWeight = 1;
  };

  for (;;) {
    if (!groupLeft) {
      if (selectorIndex >= selectorCount) throw new Error("bzip2: selector дууссан");
      table = tables[selectors[selectorIndex++]!]!;
      groupLeft = GROUP_SIZE;
    }
    groupLeft--;
    const sym = decodeSymbol(reader, table);
    if (sym === RUNA || sym === RUNB) {
      run += (sym === RUNA ? 1 : 2) * runWeight;
      runWeight <<= 1;
      if (run > blockSize) throw new Error("bzip2: давталт хэт урт");
      continue;
    }
    flushRun();
    if (sym === endOfBlock) break;
    const index = sym - 1;
    const value = mtf[index]!;
    mtf.splice(index, 1);
    mtf.unshift(value);
    const byte = seqToUnseq[value]!;
    if (length >= blockSize) throw new Error("bzip2: блок хэт урт");
    counts[byte]!++;
    tt[length++] = byte;
  }
  if (origPtr >= length) throw new Error("bzip2: origPtr буруу");

  const cumulative = new Int32Array(256);
  for (let i = 1; i < 256; i++) cumulative[i] = cumulative[i - 1]! + counts[i - 1]!;
  for (let i = 0; i < length; i++) {
    const byte = tt[i]! & 0xff;
    tt[cumulative[byte]!]! |= i << 8;
    cumulative[byte]!++;
  }

  let crc = 0xffffffff;
  let pos = tt[origPtr]! >>> 8;
  let previous = -1;
  let same = 0;
  for (let i = 0; i < length; i++) {
    pos = tt[pos]!;
    const byte = pos & 0xff;
    pos >>>= 8;
    if (same === 4) {
      for (let k = 0; k < byte; k++) {
        out.push(previous);
        crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ previous) & 0xff]!;
      }
      same = 0;
      previous = -1;
      continue;
    }
    same = byte === previous ? same + 1 : 1;
    previous = byte;
    out.push(byte);
    crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!;
  }
  if ((~crc >>> 0) !== expectedCrc) throw new Error("bzip2: CRC таарахгүй");
}

function isStreamHeader(bytes: Uint8Array, at: number): boolean {
  return (
    bytes[at] === 0x42 &&
    bytes[at + 1] === 0x5a &&
    bytes[at + 2] === 0x68 &&
    bytes[at + 3]! >= 0x31 &&
    bytes[at + 3]! <= 0x39
  );
}

export function isBzip2(bytes: Uint8Array): boolean {
  return isStreamHeader(bytes, 0);
}

export function bunzip2(bytes: Uint8Array): Uint8Array {
  if (!isBzip2(bytes)) throw new Error("bzip2 файл биш");
  const out = new ByteSink();
  const reader = new BitReader(bytes);
  for (;;) {
    reader.read(24);
    const blockSize = (reader.read(8) - 0x30) * 100000;
    for (;;) {
      const hi = reader.read(24);
      const lo = reader.read(24);
      if (hi === BLOCK_MAGIC_HI && lo === BLOCK_MAGIC_LO) {
        decodeBlock(reader, blockSize, out);
        continue;
      }
      if (hi === END_MAGIC_HI && lo === END_MAGIC_LO) break;
      throw new Error("bzip2: блокийн тэмдэг буруу");
    }
    reader.read(32);
    reader.alignToByte();
    const offset = bytes.length - reader.remaining;
    if (reader.remaining < 4 || !isStreamHeader(bytes, offset)) break;
  }
  return out.bytes();
}
