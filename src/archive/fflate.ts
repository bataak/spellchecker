import { decodeCapped } from "./capped.ts";

export const MAX_UNPACKED = 1024 * 1024 * 1024;
export const TOO_LARGE = "Задалсан өгөгдөл хэт том байна";

let loading: Promise<typeof import("fflate")> | null = null;

export function fflate(): Promise<typeof import("fflate")> {
  loading ??= import("fflate");
  return loading;
}

export const isGzip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x1f && bytes[1] === 0x8b;

export async function gunzipped(
  bytes: Uint8Array,
  limit = MAX_UNPACKED,
): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  const { Gunzip } = await fflate();
  const plain = decodeCapped((sink) => new Gunzip(sink), bytes, limit);
  if (!plain) throw new Error(TOO_LARGE);
  return plain;
}
