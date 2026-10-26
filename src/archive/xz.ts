import { fail, Lzma2Decoder, Output } from "./lzma2.ts";

const HEADER_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const FOOTER_MAGIC = [0x59, 0x5a];
const FILTER_LZMA2 = 0x21;
const CHECK_SIZE = [0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const [CRC64_LO, CRC64_HI] = (() => {
  const lo = new Uint32Array(256);
  const hi = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let l = i;
    let h = 0;
    for (let k = 0; k < 8; k++) {
      const carry = l & 1;
      l = ((l >>> 1) | (h << 31)) >>> 0;
      h = h >>> 1;
      if (carry) {
        l = (l ^ 0xd7870f42) >>> 0;
        h = (h ^ 0xc96c5795) >>> 0;
      }
    }
    lo[i] = l;
    hi[i] = h;
  }
  return [lo, hi];
})();

export function crc32(
  bytes: Uint8Array,
  start = 0,
  end = bytes.length,
): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++)
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function crc64(
  bytes: Uint8Array,
  start: number,
  end: number,
): [number, number] {
  let lo = 0xffffffff;
  let hi = 0xffffffff;
  for (let i = start; i < end; i++) {
    const index = (lo ^ bytes[i]!) & 0xff;
    const nextLo = (lo >>> 8) | (hi << 24);
    lo = (nextLo ^ CRC64_LO[index]!) >>> 0;
    hi = ((hi >>> 8) ^ CRC64_HI[index]!) >>> 0;
  }
  return [(lo ^ 0xffffffff) >>> 0, (hi ^ 0xffffffff) >>> 0];
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at]! |
      (bytes[at + 1]! << 8) |
      (bytes[at + 2]! << 16) |
      (bytes[at + 3]! << 24)) >>>
    0
  );
}

function readVarint(bytes: Uint8Array, at: number): [number, number] {
  let value = 0;
  let scale = 1;
  for (let i = 0; i < 9; i++) {
    if (at + i >= bytes.length) fail("өгөгдөл дутуу");
    const byte = bytes[at + i]!;
    value += (byte & 0x7f) * scale;
    if (!(byte & 0x80)) return [value, at + i + 1];
    scale *= 128;
  }
  return fail("тоо буруу");
}

function matches(
  bytes: Uint8Array,
  at: number,
  magic: readonly number[],
): boolean {
  return magic.every((byte, i) => bytes[at + i] === byte);
}

function verifyCheck(
  type: number,
  data: Uint8Array,
  start: number,
  end: number,
  check: Uint8Array,
  at: number,
): void {
  if (type === 1) {
    if (crc32(data, start, end) !== readUint32(check, at))
      fail("CRC32 таарсангүй");
  } else if (type === 4) {
    const [lo, hi] = crc64(data, start, end);
    if (lo !== readUint32(check, at) || hi !== readUint32(check, at + 4))
      fail("CRC64 таарсангүй");
  }
}

function readBlockHeader(input: Uint8Array, pos: number): number {
  const headerSize = (input[pos]! + 1) * 4;
  if (pos + headerSize > input.length) fail("өгөгдөл дутуу");
  if (
    crc32(input, pos, pos + headerSize - 4) !==
    readUint32(input, pos + headerSize - 4)
  )
    fail("блокийн толгойн CRC таарсангүй");
  const blockFlags = input[pos + 1]!;
  if (blockFlags & 0x3c) fail("блокийн туг буруу");
  let at = pos + 2;
  if (blockFlags & 0x40) at = readVarint(input, at)[1];
  if (blockFlags & 0x80) at = readVarint(input, at)[1];
  if ((blockFlags & 0x03) !== 0) fail("LZMA2-оос өөр шүүлтүүр дэмжихгүй");
  const [filter, afterId] = readVarint(input, at);
  const [propsSize, afterSize] = readVarint(input, afterId);
  if (filter !== FILTER_LZMA2 || propsSize !== 1)
    fail("LZMA2-оос өөр шүүлтүүр дэмжихгүй");
  if (input[afterSize]! > 40) fail("толины хэмжээ буруу");
  return headerSize;
}

function decodeBlock(
  input: Uint8Array,
  pos: number,
  out: Output,
  flags: number,
): number {
  const headerSize = readBlockHeader(input, pos);
  const dataStart = out.length;
  let at = new Lzma2Decoder(input, out).decode(pos + headerSize);
  while ((at - pos) % 4 !== 0) {
    if (input[at] !== 0) fail("блокийн дүүргэлт буруу");
    at++;
  }
  const checkSize = CHECK_SIZE[flags]!;
  if (at + checkSize > input.length) fail("өгөгдөл дутуу");
  verifyCheck(flags, out.bytes, dataStart, out.length, input, at);
  return at + checkSize;
}

function readIndex(input: Uint8Array, start: number, blocks: number): number {
  const [records, indexAt] = readVarint(input, start + 1);
  let at = indexAt;
  if (records !== blocks) fail("индекс зөрсөн");
  for (let i = 0; i < records; i++) {
    at = readVarint(input, at)[1];
    at = readVarint(input, at)[1];
  }
  while ((at - start) % 4 !== 0) {
    if (input[at] !== 0) fail("индексийн дүүргэлт буруу");
    at++;
  }
  if (crc32(input, start, at) !== readUint32(input, at))
    fail("индексийн CRC таарсангүй");
  return at + 4;
}

function checkFooter(
  input: Uint8Array,
  at: number,
  indexStart: number,
  flags: number,
): void {
  if (at + 12 > input.length) fail("өгөгдөл дутуу");
  if (!matches(input, at + 10, FOOTER_MAGIC)) fail("төгсгөл буруу");
  if (crc32(input, at + 4, at + 10) !== readUint32(input, at))
    fail("төгсгөлийн CRC таарсангүй");
  if ((readUint32(input, at + 4) + 1) * 4 !== at - indexStart)
    fail("индексийн хэмжээ зөрсөн");
  if (input[at + 8] !== 0 || input[at + 9] !== flags)
    fail("төгсгөлийн туг зөрсөн");
}

function readStreamFlags(input: Uint8Array, start: number): number {
  if (!matches(input, start, HEADER_MAGIC)) fail("xz файл биш");
  const flags = input[start + 7]!;
  if (input[start + 6] !== 0 || flags > 0x0f) fail("урсгалын туг буруу");
  if (crc32(input, start + 6, start + 8) !== readUint32(input, start + 8))
    fail("толгойн CRC таарсангүй");
  return flags;
}

function decodeStream(input: Uint8Array, start: number, out: Output): number {
  const flags = readStreamFlags(input, start);
  let pos = start + 12;
  let blocks = 0;
  for (;;) {
    if (pos >= input.length) fail("өгөгдөл дутуу");
    if (input[pos] === 0) break;
    pos = decodeBlock(input, pos, out, flags);
    blocks++;
  }
  const at = readIndex(input, pos, blocks);
  checkFooter(input, at, pos, flags);
  return at + 12;
}

export function isXz(bytes: Uint8Array): boolean {
  return matches(bytes, 0, HEADER_MAGIC);
}

export function unxz(input: Uint8Array): Uint8Array {
  const out = new Output(input.length * 4);
  let pos = decodeStream(input, 0, out);
  while (pos < input.length) {
    while (pos < input.length && input[pos] === 0) pos++;
    if (pos >= input.length) break;
    if (pos % 4 !== 0) fail("урсгалын дүүргэлт буруу");
    pos = decodeStream(input, pos, out);
  }
  return out.result();
}
