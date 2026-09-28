import { unzip } from "fflate";
import { TEX_BUNDLE, TEX_ENGINE } from "./texbundle.ts";

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

let engine: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function asset(path: string): string {
  return import.meta.env.BASE_URL + path;
}

function unpack(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => (error ? reject(error) : resolve(files)));
  });
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
    const [files] = await Promise.all([
      unpack(new Uint8Array(await response.arrayBuffer())),
      booted,
    ]);
    for (const [name, data] of Object.entries(files))
      worker.postMessage({ cmd: "writetex", name, src: data });
    return worker;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

function compileOn(
  worker: Worker,
  tex: string,
): Promise<Uint8Array<ArrayBuffer>> {
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
      }
      reject(new PdfError(reply.log ?? ""));
    };
    worker.postMessage({ cmd: "flushcache" });
    worker.postMessage({ cmd: "writefile", url: "main.tex", src: tex });
    worker.postMessage({ cmd: "setmainfile", url: "main.tex" });
    worker.postMessage({ cmd: "compilelatex" });
  });
}

export function compilePdf(tex: string): Promise<Uint8Array<ArrayBuffer>> {
  const job = queue.then(async () => {
    engine ??= start().catch((error: unknown) => {
      engine = null;
      throw error;
    });
    return compileOn(await engine, tex);
  });
  queue = job.catch(() => undefined);
  return job;
}
