import { unzipSync } from "fflate";
import {
  TEX_BUNDLE,
  TEX_ENGINE,
  TEX_FONT_FILES,
  TEX_FONTS,
} from "./texbundle.ts";

interface EngineReply {
  readonly result?: string;
  readonly cmd?: string;
  readonly status?: number;
  readonly log?: string;
  readonly pdf?: ArrayBuffer;
}

const ENGINE_CRASHED = -254;

function decodeTexBytes(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const hex = /^\^\^([0-9a-f]{2})/.exec(text.slice(i, i + 4));
    if (hex) {
      bytes.push(Number.parseInt(hex[1]!, 16));
      i += 3;
    } else {
      bytes.push(...new TextEncoder().encode(text[i]!));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\uFFFD/g, "");
}

function errorPlace(log: string): string | null {
  const place = /^l\.\d+ (.*)\n(.*)$/m.exec(log);
  if (!place) return null;
  const before = decodeTexBytes(
    place[1]!.replace(/^\.\.\.(?:\^?[0-9a-f]{1,2}(?=\^\^)|\^(?=\^\^))?/, ""),
  ).slice(-40);
  const after = decodeTexBytes(place[2]!).trim().slice(0, 40);
  return (before + " " + after).trim();
}

export class PdfError extends Error {
  readonly log: string;

  constructor(log: string) {
    const reason = /^! (?:LaTeX Error: )?(.+)$/m.exec(log)?.[1];
    const place = errorPlace(log);
    super(
      "PDF үүсгэж чадсангүй" +
        (reason ? ": " + reason : ".") +
        (place ? " — «" + place + "»" : ""),
    );
    this.name = "PdfError";
    this.log = log;
  }
}

const MISSING_FONT =
  /cannot open Type 1 font file|Metric \(TFM\) file not found|not loadable: Metric/;

export function missingFont(error: unknown): boolean {
  return error instanceof PdfError && MISSING_FONT.test(error.log);
}

let engine: Promise<Worker> | null = null;
let live: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();
let prefetching: Promise<void> | null = null;

const FONT_CACHE = "tex-" + TEX_FONTS.split("/")[1];

function asset(path: string): string {
  return import.meta.env.BASE_URL + path;
}

async function fontCache(): Promise<Cache | null> {
  try {
    return await caches.open(FONT_CACHE);
  } catch {
    return null;
  }
}

function sendFont(worker: Worker, name: string, data: ArrayBuffer): void {
  worker.postMessage({ cmd: "writetex", name, src: new Uint8Array(data) }, [
    data,
  ]);
}

async function loadCachedFonts(worker: Worker): Promise<void> {
  const cache = await fontCache();
  if (!cache) return;
  for (const name of TEX_FONT_FILES) {
    const hit = await cache.match(asset(TEX_FONTS + name));
    if (hit) sendFont(worker, name, await hit.arrayBuffer());
  }
}

async function dropOldFontCaches(): Promise<void> {
  try {
    for (const key of await caches.keys())
      if (key.startsWith("tex-fonts-") && key !== FONT_CACHE)
        await caches.delete(key);
  } catch {}
}

export function prefetchFonts(): Promise<void> {
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData) return Promise.resolve();
  prefetching ??= (async () => {
    await dropOldFontCaches();
    const cache = await fontCache();
    if (!cache) return;
    let complete = true;
    for (const name of TEX_FONT_FILES) {
      const url = asset(TEX_FONTS + name);
      if (await cache.match(url)) continue;
      let response: Response;
      try {
        response = await fetch(url, { priority: "low" });
      } catch {
        complete = false;
        break;
      }
      if (!response.ok) {
        complete = false;
        continue;
      }
      const data = await response.arrayBuffer();
      try {
        await cache.put(url, new Response(data.slice(0)));
      } catch {
        complete = false;
        break;
      }
      if (live) sendFont(live, name, data);
    }
    if (!complete) prefetching = null;
  })();
  return prefetching;
}

async function start(): Promise<Worker> {
  const worker = new Worker(asset(TEX_ENGINE));
  try {
    const booted = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EngineReply>) => {
        if (event.data.result === "ok") resolve();
        else reject(new Error("TeX хөдөлгүүр ачаалагдсангүй"));
      };
      worker.onerror = () => reject(new Error("TeX хөдөлгүүр ачаалагдсангүй"));
    });
    const response = await fetch(asset(TEX_BUNDLE));
    if (!response.ok) throw new Error("TeX файлууд татагдсангүй");
    const [bytes] = await Promise.all([response.arrayBuffer(), booted]);
    const files = unzipSync(new Uint8Array(bytes));
    for (const [name, data] of Object.entries(files))
      worker.postMessage({ cmd: "writetex", name, src: data });
    worker.postMessage({
      cmd: "fonturl",
      url: new URL(asset(TEX_FONTS), location.href).href,
    });
    await loadCachedFonts(worker);
    live = worker;
    return worker;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

function runOnce(worker: Worker): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EngineReply>) => {
      const reply = event.data;
      if (reply.cmd !== "compile") return;
      if (reply.result === "ok" && reply.pdf) {
        resolve(new Uint8Array(reply.pdf));
        return;
      }
      if (reply.status === ENGINE_CRASHED) {
        worker.terminate();
        engine = null;
        live = null;
      }
      reject(new PdfError(reply.log ?? ""));
    };
    worker.postMessage({ cmd: "compilelatex" });
  });
}

async function compileOn(
  worker: Worker,
  tex: string,
  passes: number,
  files: Readonly<Record<string, Uint8Array>>,
): Promise<Uint8Array<ArrayBuffer>> {
  worker.postMessage({ cmd: "flushcache" });
  for (const [url, src] of Object.entries(files))
    worker.postMessage({ cmd: "writefile", url, src });
  worker.postMessage({ cmd: "writefile", url: "main.tex", src: tex });
  worker.postMessage({ cmd: "setmainfile", url: "main.tex" });
  let pdf = await runOnce(worker);
  for (let pass = 1; pass < passes; pass += 1) pdf = await runOnce(worker);
  return pdf;
}

export function compilePdf(
  tex: string,
  passes = 1,
  files: Readonly<Record<string, Uint8Array>> = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const job = queue.then(async () => {
    engine ??= start().catch((error: unknown) => {
      engine = null;
      throw error;
    });
    return compileOn(await engine, tex, passes, files);
  });
  queue = job.catch(() => undefined);
  return job;
}
