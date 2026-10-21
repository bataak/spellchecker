let loading: Promise<typeof import("fflate")> | null = null;

export function fflate(): Promise<typeof import("fflate")> {
  loading ??= import("fflate");
  return loading;
}

export const isGzip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x1f && bytes[1] === 0x8b;

export async function gunzipped(bytes: Uint8Array): Promise<Uint8Array> {
  return isGzip(bytes) ? (await fflate()).gunzipSync(bytes) : bytes;
}
