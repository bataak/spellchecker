import { gunzipSync } from "fflate";

const decoder = new TextDecoder("utf-8");

export async function fetchGzText(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(url + " -> " + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const gz = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!gz) return decoder.decode(buf);
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([buf])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return decoder.decode(gunzipSync(buf));
}

export function plausibleDict(aff: string, dic: string): boolean {
  if (!/^\s*SET\s+UTF-8/m.test(aff)) return false;
  const cut = dic.indexOf("\n");
  const firstLine = dic.slice(0, cut === -1 ? 32 : cut).trim();
  const declared = parseInt(firstLine, 10);
  if (!Number.isFinite(declared) || declared < 1000) return false;
  return dic.length > 100000;
}

export async function loadDictText(
  affUrl: string,
  dicUrl: string,
  fetchers: (typeof fetch)[],
): Promise<[string, string] | null> {
  for (const fetcher of fetchers) {
    try {
      const [aff, dic] = await Promise.all([
        fetchGzText(affUrl, fetcher),
        fetchGzText(dicUrl, fetcher),
      ]);
      if (plausibleDict(aff, dic)) return [aff, dic];
    } catch (_) {
      /* дараагийн эх сурвалж уруу шилжинэ */
    }
  }
  return null;
}
