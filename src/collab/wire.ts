export const SYNC_REQUEST = 0;
export const SYNC_UPDATE = 1;
export const CURSOR = 2;
export const LINKS = 3;
export const BLOB_WANT = 4;
export const BLOB_PART = 5;
export const BLOB_NONE = 6;

export type BlobKind = typeof BLOB_WANT | typeof BLOB_PART | typeof BLOB_NONE;

export type FrameKind =
  | typeof SYNC_REQUEST
  | typeof SYNC_UPDATE
  | typeof CURSOR
  | typeof LINKS
  | BlobKind;

export interface Frame {
  readonly kind: FrameKind;
  readonly body: Uint8Array;
}

export const CHUNK_BYTES = 16 * 1024;
const WHOLE = 0;
const PART = 1;
const LAST = 2;

export function encodeFrame(kind: FrameKind, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.byteLength + 1);
  out[0] = kind;
  out.set(body, 1);
  return out;
}

export function decodeFrame(data: Uint8Array): Frame | null {
  const kind = data[0];
  if (kind === undefined || kind > BLOB_NONE) return null;
  return { kind: kind as FrameKind, body: data.subarray(1) };
}

export function chunk(data: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const room = size - 1;
  if (data.byteLength <= room) return [withFlag(WHOLE, data)];
  const out: Uint8Array[] = [];
  for (let at = 0; at < data.byteLength; at += room) {
    const end = Math.min(at + room, data.byteLength);
    out.push(
      withFlag(end === data.byteLength ? LAST : PART, data.subarray(at, end)),
    );
  }
  return out;
}

function withFlag(flag: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.byteLength + 1);
  out[0] = flag;
  out.set(data, 1);
  return out;
}

export interface Assembler {
  push(piece: Uint8Array): Uint8Array | null;
}

export function createAssembler(limit: number): Assembler {
  let parts: Uint8Array[] = [];
  let size = 0;
  let skipping = false;
  const clear = (): void => {
    parts = [];
    size = 0;
  };
  return {
    push(piece) {
      const flag = piece[0];
      const body = piece.subarray(1);
      if (flag === WHOLE) {
        clear();
        skipping = false;
        return body;
      }
      if (flag !== PART && flag !== LAST) return null;
      if (!skipping) {
        size += body.byteLength;
        if (size > limit) {
          clear();
          skipping = true;
        } else parts.push(body.slice());
      }
      if (flag === PART) return null;
      if (skipping) {
        skipping = false;
        return null;
      }
      const out = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        out.set(part, at);
        at += part.byteLength;
      }
      clear();
      return out;
    },
  };
}
