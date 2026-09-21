export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

const BLOCK = 512;
const decoder = new TextDecoder();

function text(bytes: Uint8Array, start: number, length: number): string {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return decoder.decode(end < 0 ? slice : slice.subarray(0, end));
}

function number(bytes: Uint8Array, start: number, length: number): number {
  if (bytes[start]! & 0x80) {
    let value = bytes[start]! & 0x7f;
    for (let i = 1; i < length; i++) value = value * 256 + bytes[start + i]!;
    return value;
  }
  const digits = text(bytes, start, length).trim();
  return digits ? parseInt(digits, 8) : 0;
}

function isZeroBlock(bytes: Uint8Array, at: number): boolean {
  for (let i = at; i < at + BLOCK; i++) if (bytes[i]) return false;
  return true;
}

function validChecksum(bytes: Uint8Array, at: number): boolean {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++)
    sum += i >= 148 && i < 156 ? 0x20 : bytes[at + i]!;
  return sum === number(bytes, at + 148, 8);
}

export function isTar(bytes: Uint8Array): boolean {
  return bytes.length >= BLOCK && validChecksum(bytes, 0);
}

function paxPath(data: Uint8Array): string | null {
  for (const line of decoder.decode(data).split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(line);
    if (match) return match[1]!;
  }
  return null;
}

export function untar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let pos = 0;
  let longName: string | null = null;
  let extendedName: string | null = null;
  while (pos + BLOCK <= bytes.length) {
    if (isZeroBlock(bytes, pos)) break;
    if (!validChecksum(bytes, pos)) throw new Error("tar: толгой эвдэрсэн");
    const size = number(bytes, pos + 124, 12);
    const type = bytes[pos + 156]!;
    const dataStart = pos + BLOCK;
    if (dataStart + size > bytes.length) throw new Error("tar: өгөгдөл дутуу");
    const data = bytes.subarray(dataStart, dataStart + size);
    const prefix = text(bytes, pos + 345, 155);
    const shortName = text(bytes, pos, 100);
    pos = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 0x4c) {
      longName = text(data, 0, data.length);
      continue;
    }
    if (type === 0x78) {
      extendedName = paxPath(data) ?? extendedName;
      continue;
    }
    if (type === 0x67) continue;
    const name =
      longName ?? extendedName ?? (prefix ? prefix + "/" + shortName : shortName);
    longName = null;
    extendedName = null;
    if (type === 0 || type === 0x30 || type === 0x37)
      entries.push({ name, data: data.slice() });
  }
  return entries;
}
