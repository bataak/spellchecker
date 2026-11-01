import { Inflate } from "fflate";

const STEP = 16 * 1024;

export function inflateCapped(
  data: Uint8Array,
  limit: number,
): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let size = 0;
  const inflater = new Inflate((chunk) => {
    size += chunk.byteLength;
    parts.push(chunk);
  });
  for (let at = 0; at < data.byteLength; at += STEP) {
    inflater.push(data.subarray(at, at + STEP), at + STEP >= data.byteLength);
    if (size > limit) return null;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
