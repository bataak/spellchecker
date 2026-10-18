const HEADER_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const FOOTER_MAGIC = [0x59, 0x5a];
const FILTER_LZMA2 = 0x21;
const CHECK_SIZE = [0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64];

const STATES = 12;
const POS_STATES_MAX = 16;
const LITERAL_STATES = 7;
const DIST_STATES = 4;
const DIST_SLOTS = 64;
const DIST_MODEL_START = 4;
const DIST_MODEL_END = 14;
const FULL_DISTANCES = 128;
const ALIGN_BITS = 4;
const MATCH_LEN_MIN = 2;
const LEN_LOW_BITS = 3;
const LEN_MID_BITS = 3;
const LEN_HIGH_BITS = 8;
const LEN_LOW = 1 << LEN_LOW_BITS;
const LEN_MID = 1 << LEN_MID_BITS;
const PROB_INIT = 1024;
const TOP = 1 << 24;

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

function fail(reason: string): never {
  throw new Error("xz: " + reason);
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

class Output {
  bytes: Uint8Array;
  length = 0;

  constructor(capacity: number) {
    this.bytes = new Uint8Array(Math.max(capacity, 1024));
  }

  reserve(extra: number): void {
    const need = this.length + extra;
    if (need <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }

  result(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

class RangeDecoder {
  range = 0;
  code = 0;
  pos = 0;
  end = 0;
  private readonly input: Uint8Array;

  constructor(input: Uint8Array) {
    this.input = input;
  }

  reset(start: number, end: number): void {
    if (end - start < 5 || this.input[start] !== 0) fail("range coder");
    this.end = end;
    this.range = 0xffffffff;
    this.code = 0;
    for (let i = 1; i < 5; i++)
      this.code = this.code * 256 + this.input[start + i]!;
    this.pos = start + 5;
    if (this.code === this.range) fail("range coder");
  }

  private next(): number {
    if (this.pos >= this.end) fail("өгөгдөл дутуу");
    return this.input[this.pos++]!;
  }

  bit(probs: Uint16Array, index: number): number {
    const prob = probs[index]!;
    const bound = (this.range >>> 11) * prob;
    let bit: number;
    if (this.code < bound) {
      this.range = bound;
      probs[index] = prob + ((2048 - prob) >>> 5);
      bit = 0;
    } else {
      this.range -= bound;
      this.code -= bound;
      probs[index] = prob - (prob >>> 5);
      bit = 1;
    }
    if (this.range < TOP) {
      this.range *= 256;
      this.code = this.code * 256 + this.next();
    }
    return bit;
  }

  direct(count: number): number {
    let result = 0;
    for (let i = 0; i < count; i++) {
      this.range = this.range >>> 1;
      let bit = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        bit = 1;
      }
      result = ((result << 1) | bit) >>> 0;
      if (this.range < TOP) {
        this.range *= 256;
        this.code = this.code * 256 + this.next();
      }
    }
    return result;
  }

  tree(probs: Uint16Array, base: number, bits: number): number {
    let symbol = 1;
    for (let i = 0; i < bits; i++)
      symbol = (symbol << 1) | this.bit(probs, base + symbol);
    return symbol - (1 << bits);
  }

  reverse(probs: Uint16Array, base: number, bits: number): number {
    let symbol = 1;
    let result = 0;
    for (let i = 0; i < bits; i++) {
      const bit = this.bit(probs, base + symbol);
      symbol = (symbol << 1) | bit;
      result |= bit << i;
    }
    return result;
  }
}

const IS_MATCH = 0;
const IS_REP = IS_MATCH + STATES * POS_STATES_MAX;
const IS_REP0 = IS_REP + STATES;
const IS_REP1 = IS_REP0 + STATES;
const IS_REP2 = IS_REP1 + STATES;
const IS_REP0_LONG = IS_REP2 + STATES;
const DIST_SLOT = IS_REP0_LONG + STATES * POS_STATES_MAX;
const DIST_SPECIAL = DIST_SLOT + DIST_STATES * DIST_SLOTS;
const DIST_ALIGN = DIST_SPECIAL + FULL_DISTANCES - DIST_MODEL_END;
const LEN_SIZE =
  2 + POS_STATES_MAX * (LEN_LOW + LEN_MID) + (1 << LEN_HIGH_BITS);
const MATCH_LEN = DIST_ALIGN + (1 << ALIGN_BITS);
const REP_LEN = MATCH_LEN + LEN_SIZE;
const LITERAL = REP_LEN + LEN_SIZE;
const LITERAL_SIZE = 0x300;

class Lzma2Decoder {
  private readonly rc: RangeDecoder;
  private probs = new Uint16Array(LITERAL + LITERAL_SIZE * 16);
  private lc = 0;
  private lp = 0;
  private pb = 0;
  private state = 0;
  private rep0 = 0;
  private rep1 = 0;
  private rep2 = 0;
  private rep3 = 0;
  private pending = 0;
  private dictStart = 0;
  private readonly input: Uint8Array;
  private readonly out: Output;

  constructor(input: Uint8Array, out: Output) {
    this.input = input;
    this.out = out;
    this.rc = new RangeDecoder(input);
  }

  private resetState(): void {
    this.probs.fill(PROB_INIT);
    this.state = 0;
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0;
    this.pending = 0;
  }

  private setProps(byte: number): void {
    if (byte > 224) fail("LZMA шинж буруу");
    this.lc = byte % 9;
    byte = Math.floor(byte / 9);
    this.lp = byte % 5;
    this.pb = Math.floor(byte / 5);
    if (this.lc + this.lp > 4) fail("LZMA шинж буруу");
  }

  decode(start: number): number {
    const input = this.input;
    let pos = start;
    let needDictReset = true;
    let needProps = true;
    for (;;) {
      if (pos >= input.length) fail("өгөгдөл дутуу");
      const control = input[pos++]!;
      if (control === 0x00) return pos;
      if (control >= 0xe0 || control === 0x01) {
        needProps = true;
        needDictReset = false;
        this.dictStart = this.out.length;
      } else if (needDictReset) fail("толь шинэчлэгдээгүй");
      if (control >= 0x80) {
        if (pos + 4 > input.length) fail("өгөгдөл дутуу");
        const unpacked =
          ((control & 0x1f) << 16) + (input[pos]! << 8) + input[pos + 1]! + 1;
        const packed = (input[pos + 2]! << 8) + input[pos + 3]! + 1;
        pos += 4;
        if (control >= 0xc0) {
          if (pos >= input.length) fail("өгөгдөл дутуу");
          this.setProps(input[pos++]!);
          needProps = false;
          this.resetState();
        } else if (needProps) fail("LZMA шинж алга");
        else if (control >= 0xa0) this.resetState();
        if (pos + packed > input.length) fail("өгөгдөл дутуу");
        this.rc.reset(pos, pos + packed);
        this.chunk(unpacked);
        if (this.rc.pos !== pos + packed) fail("LZMA хэсэг зөрсөн");
        pos += packed;
      } else {
        if (control > 0x02) fail("LZMA2 удирдлага буруу");
        if (pos + 2 > input.length) fail("өгөгдөл дутуу");
        const size = (input[pos]! << 8) + input[pos + 1]! + 1;
        pos += 2;
        if (pos + size > input.length) fail("өгөгдөл дутуу");
        this.out.reserve(size);
        this.out.bytes.set(input.subarray(pos, pos + size), this.out.length);
        this.out.length += size;
        pos += size;
      }
    }
  }

  private copy(distance: number, length: number): void {
    const out = this.out;
    if (out.length - this.dictStart <= distance) fail("зай буруу");
    out.reserve(length);
    const bytes = out.bytes;
    let from = out.length - distance - 1;
    let to = out.length;
    for (let i = 0; i < length; i++) bytes[to++] = bytes[from++]!;
    out.length = to;
  }

  private length(base: number, posState: number): number {
    const rc = this.rc;
    const probs = this.probs;
    if (rc.bit(probs, base) === 0)
      return (
        MATCH_LEN_MIN +
        rc.tree(probs, base + 2 + posState * LEN_LOW, LEN_LOW_BITS)
      );
    if (rc.bit(probs, base + 1) === 0)
      return (
        MATCH_LEN_MIN +
        LEN_LOW +
        rc.tree(
          probs,
          base + 2 + POS_STATES_MAX * LEN_LOW + posState * LEN_MID,
          LEN_MID_BITS,
        )
      );
    return (
      MATCH_LEN_MIN +
      LEN_LOW +
      LEN_MID +
      rc.tree(
        probs,
        base + 2 + POS_STATES_MAX * (LEN_LOW + LEN_MID),
        LEN_HIGH_BITS,
      )
    );
  }

  private chunk(unpacked: number): void {
    const rc = this.rc;
    const probs = this.probs;
    const out = this.out;
    const end = out.length + unpacked;
    const pbMask = (1 << this.pb) - 1;
    const lpMask = (1 << this.lp) - 1;
    const lc = this.lc;
    out.reserve(unpacked);
    if (this.pending > 0) {
      const now = Math.min(this.pending, end - out.length);
      this.copy(this.rep0, now);
      this.pending -= now;
    }
    while (out.length < end) {
      const pos = out.length;
      const posState = pos & pbMask;
      const state = this.state;
      if (rc.bit(probs, IS_MATCH + state * POS_STATES_MAX + posState) === 0) {
        const prev = pos > this.dictStart ? out.bytes[pos - 1]! : 0;
        const base =
          LITERAL +
          LITERAL_SIZE * (((pos & lpMask) << lc) + (prev >>> (8 - lc)));
        let symbol = 1;
        if (state < LITERAL_STATES) {
          do symbol = (symbol << 1) | rc.bit(probs, base + symbol);
          while (symbol < 0x100);
        } else {
          if (pos - this.dictStart <= this.rep0) fail("зай буруу");
          let match = out.bytes[pos - this.rep0 - 1]! << 1;
          let offset = 0x100;
          do {
            const matchBit = match & offset;
            match <<= 1;
            if (rc.bit(probs, base + offset + matchBit + symbol)) {
              symbol = (symbol << 1) | 1;
              offset = matchBit;
            } else {
              symbol <<= 1;
              offset &= ~matchBit;
            }
          } while (symbol < 0x100);
        }
        out.bytes[out.length++] = symbol & 0xff;
        this.state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let length: number;
      if (rc.bit(probs, IS_REP + state) === 0) {
        this.state = state < LITERAL_STATES ? 7 : 10;
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        length = this.length(MATCH_LEN, posState);
        const distState =
          length < DIST_STATES + MATCH_LEN_MIN
            ? length - MATCH_LEN_MIN
            : DIST_STATES - 1;
        const slot = rc.tree(probs, DIST_SLOT + distState * DIST_SLOTS, 6);
        if (slot < DIST_MODEL_START) this.rep0 = slot;
        else {
          const limit = (slot >>> 1) - 1;
          let distance = (2 | (slot & 1)) * 2 ** limit;
          if (slot < DIST_MODEL_END)
            distance += rc.reverse(
              probs,
              DIST_SPECIAL + distance - slot - 1,
              limit,
            );
          else {
            distance += rc.direct(limit - ALIGN_BITS) * 2 ** ALIGN_BITS;
            distance += rc.reverse(probs, DIST_ALIGN, ALIGN_BITS);
          }
          if (distance >= 0xffffffff) fail("төгсгөлийн тэмдэг");
          this.rep0 = distance;
        }
      } else {
        if (rc.bit(probs, IS_REP0 + state) === 0) {
          if (
            rc.bit(probs, IS_REP0_LONG + state * POS_STATES_MAX + posState) ===
            0
          ) {
            this.state = state < LITERAL_STATES ? 9 : 11;
            this.copy(this.rep0, 1);
            continue;
          }
        } else {
          let distance: number;
          if (rc.bit(probs, IS_REP1 + state) === 0) distance = this.rep1;
          else {
            if (rc.bit(probs, IS_REP2 + state) === 0) distance = this.rep2;
            else {
              distance = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = distance;
        }
        this.state = state < LITERAL_STATES ? 8 : 11;
        length = this.length(REP_LEN, posState);
      }
      const now = Math.min(length, end - out.length);
      this.copy(this.rep0, now);
      this.pending = length - now;
    }
  }
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

function decodeStream(input: Uint8Array, start: number, out: Output): number {
  if (!matches(input, start, HEADER_MAGIC)) fail("xz файл биш");
  const flags = input[start + 7]!;
  if (input[start + 6] !== 0 || flags > 0x0f) fail("урсгалын туг буруу");
  if (crc32(input, start + 6, start + 8) !== readUint32(input, start + 8))
    fail("толгойн CRC таарсангүй");
  const checkSize = CHECK_SIZE[flags]!;
  let pos = start + 12;
  let blocks = 0;
  for (;;) {
    if (pos >= input.length) fail("өгөгдөл дутуу");
    const sizeByte = input[pos]!;
    if (sizeByte === 0) break;
    const headerSize = (sizeByte + 1) * 4;
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
    const dataStart = out.length;
    const blockStart = pos;
    pos = new Lzma2Decoder(input, out).decode(pos + headerSize);
    while ((pos - blockStart) % 4 !== 0) {
      if (input[pos] !== 0) fail("блокийн дүүргэлт буруу");
      pos++;
    }
    if (pos + checkSize > input.length) fail("өгөгдөл дутуу");
    verifyCheck(flags, out.bytes, dataStart, out.length, input, pos);
    pos += checkSize;
    blocks++;
  }
  const indexStart = pos;
  let [records, at] = readVarint(input, pos + 1);
  if (records !== blocks) fail("индекс зөрсөн");
  for (let i = 0; i < records; i++) {
    at = readVarint(input, at)[1];
    at = readVarint(input, at)[1];
  }
  while ((at - indexStart) % 4 !== 0) {
    if (input[at] !== 0) fail("индексийн дүүргэлт буруу");
    at++;
  }
  if (crc32(input, indexStart, at) !== readUint32(input, at))
    fail("индексийн CRC таарсангүй");
  at += 4;
  if (at + 12 > input.length) fail("өгөгдөл дутуу");
  if (!matches(input, at + 10, FOOTER_MAGIC)) fail("төгсгөл буруу");
  if (crc32(input, at + 4, at + 10) !== readUint32(input, at))
    fail("төгсгөлийн CRC таарсангүй");
  if ((readUint32(input, at + 4) + 1) * 4 !== at - indexStart)
    fail("индексийн хэмжээ зөрсөн");
  if (input[at + 8] !== 0 || input[at + 9] !== flags)
    fail("төгсгөлийн туг зөрсөн");
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
