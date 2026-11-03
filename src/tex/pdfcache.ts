import type { TexProject } from "./projectbuild.ts";
import { noteError } from "../core/errorlog.ts";
import { imageStamp } from "./teximages.ts";

const PDF_CACHE = "tex-preview";
const PDF_TEXT_KEY = "tex-preview/last.tex";
const CACHED_PDFS = 6;
const KEPT_PDFS = 3;

const PDF_VERSION = "v2";
const STAMP_HEADER = "x-image-stamp";
const pdfUrl = (digest: string): string =>
  "tex-preview/" + PDF_VERSION + "-" + digest + ".pdf";

export interface PdfId {
  readonly digest: string;
  readonly stamp: string | null;
}

function pdfResponse(
  bytes: Uint8Array<ArrayBuffer>,
  stamp: string | null,
): Response {
  const headers = new Headers({ "content-type": "application/pdf" });
  if (stamp !== null) headers.set(STAMP_HEADER, encodeURIComponent(stamp));
  return new Response(bytes.slice(), { headers });
}

export interface CompiledPdf {
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly missing: readonly string[];
}

export interface KeptPdf extends CompiledPdf {
  readonly text: string;
}

export async function textKey(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export async function cachedPdf({
  digest,
  stamp,
}: PdfId): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const cache = await caches.open(PDF_CACHE);
    const hit = await cache.match(pdfUrl(digest));
    if (!hit) return null;
    const saved = hit.headers.get(STAMP_HEADER);
    const savedStamp = saved === null ? null : decodeURIComponent(saved);
    if (stamp !== null && savedStamp !== null && stamp !== savedStamp)
      return null;
    const bytes = new Uint8Array(await hit.arrayBuffer());
    void cache.put(pdfUrl(digest), pdfResponse(bytes, savedStamp));
    return bytes;
  } catch {
    return null;
  }
}

export async function lastTex(): Promise<{
  digest: string;
  text: string;
} | null> {
  try {
    const cache = await caches.open(PDF_CACHE);
    const hit = await cache.match(PDF_TEXT_KEY);
    const digest = hit?.headers.get("x-text-key");
    return hit && digest ? { digest, text: await hit.text() } : null;
  } catch {
    return null;
  }
}

async function saveCachedPdf(
  { digest, stamp }: PdfId,
  bytes: Uint8Array<ArrayBuffer>,
  text: string | null,
): Promise<void> {
  try {
    const cache = await caches.open(PDF_CACHE);
    await cache.put(pdfUrl(digest), pdfResponse(bytes, stamp));
    if (text !== null)
      await cache.put(
        PDF_TEXT_KEY,
        new Response(text, {
          headers: { "content-type": "text/plain", "x-text-key": digest },
        }),
      );
    const pdfs = (await cache.keys()).filter((request) =>
      request.url.endsWith(".pdf"),
    );
    for (const request of pdfs.slice(0, Math.max(0, pdfs.length - CACHED_PDFS)))
      await cache.delete(request);
  } catch (error) {
    noteError(error);
  }
}

export async function pdfIdOf(
  text: string,
  project: TexProject | null,
): Promise<PdfId | null> {
  const digest = await (project === null ? textKey(text) : project.digest());
  if (digest === null) return null;
  return { digest, stamp: project === null ? await imageStamp(text) : null };
}

export interface PdfPool {
  get(key: string): KeptPdf | undefined;
  touch(key: string): KeptPdf | undefined;
  put(key: string, kept: KeptPdf): void;
  keep(
    key: string,
    kept: KeptPdf,
    id: PdfId | null,
    project: string | null,
  ): void;
  running(key: string): Promise<CompiledPdf> | null;
  compile(key: string, run: () => Promise<CompiledPdf>): Promise<CompiledPdf>;
}

export function createPdfPool(): PdfPool {
  const kept = new Map<string, KeptPdf>();
  let active: {
    readonly key: string;
    readonly run: Promise<CompiledPdf>;
  } | null = null;

  const put = (key: string, entry: KeptPdf): void => {
    kept.delete(key);
    kept.set(key, entry);
    while (kept.size > KEPT_PDFS) kept.delete(kept.keys().next().value!);
  };

  return {
    get: (key) => kept.get(key),
    touch(key) {
      const entry = kept.get(key);
      if (entry) put(key, entry);
      return entry;
    },
    put,
    keep(key, entry, id, project) {
      put(key, entry);
      if (!entry.missing.length && id !== null)
        void saveCachedPdf(id, entry.pdf, project === null ? entry.text : null);
    },
    running: (key) => (active?.key === key ? active.run : null),
    compile(key, compile) {
      if (active?.key === key) return active.run;
      const run = compile().finally(() => {
        if (active?.run === run) active = null;
      });
      active = { key, run };
      return run;
    },
  };
}
