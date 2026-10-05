import { gunzipSync } from "fflate";

const decoder = new TextDecoder("utf-8");

export async function fetchGzBytes(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(url + " -> " + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const gz = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!gz) return buf;
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([buf])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return gunzipSync(buf);
}

export function plausibleDict(aff: Uint8Array, dic: Uint8Array): boolean {
  if (!/^\s*SET\s+UTF-8/m.test(decoder.decode(aff))) return false;
  const head = dic.subarray(0, 32);
  const cut = head.indexOf(0x0a);
  const firstLine = decoder
    .decode(cut === -1 ? head : head.subarray(0, cut))
    .trim();
  const declared = parseInt(firstLine, 10);
  if (!Number.isFinite(declared) || declared < 1000) return false;
  return dic.length > 100000;
}

export async function loadDictBytes(
  affUrl: string,
  dicUrl: string,
  fetchers: (typeof fetch)[],
): Promise<[Uint8Array, Uint8Array] | null> {
  for (const fetcher of fetchers) {
    try {
      const [aff, dic] = await Promise.all([
        fetchGzBytes(affUrl, fetcher),
        fetchGzBytes(dicUrl, fetcher),
      ]);
      if (plausibleDict(aff, dic)) return [aff, dic];
    } catch (_) {
      /* дараагийн эх сурвалж уруу шилжинэ */
    }
  }
  return null;
}
