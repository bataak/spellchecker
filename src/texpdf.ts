import { unzipSync } from "fflate";
import { unwrapLog } from "./texmissing.ts";
import {
  TEX_BUNDLE,
  TEX_ENGINE,
  TEX_FONT_FILES,
  TEX_FONTS,
} from "./texbundle.ts";
import { KEYS, at } from "./store.ts";

export interface EngineReply {
  readonly result?: string;
  readonly cmd?: string;
  readonly status?: number;
  readonly log?: string;
  readonly pdf?: ArrayBuffer;
}

const ENGINE_CRASHED = -254;
const ERRORS_IGNORED = 1;

export function replyPdf(reply: EngineReply): ArrayBuffer | null {
  if (!reply.pdf) return null;
  if (reply.result === "ok") return reply.pdf;
  return reply.status === ERRORS_IGNORED && !/^!/m.test(reply.log ?? "")
    ? reply.pdf
    : null;
}

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

  constructor(raw: string) {
    const log = unwrapLog(raw);
    const reason =
      /^!(?: |pdfTeX error: +(?:\(file [^)]*\): )?)(?:LaTeX Error: )?(.+)$/m.exec(
        log,
      )?.[1];
    const at = raw.search(/^!/m);
    const place = at < 0 ? null : errorPlace(raw.slice(at));
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

interface EngineFiles {
  readonly bundled: ReadonlySet<string>;
  readonly baseMap: Uint8Array | null;
  readonly installed: Set<string>;
  readonly maps: Map<string, Uint8Array>;
}

const engineFiles = new WeakMap<Worker, EngineFiles>();
const sessionPackages = new Set<string>();
const PACKAGE_ROUNDS = 8;
const PACKAGE_ERROR =
  /File `[^']+' not found|I can't find file|Metric \(TFM\) file not found|cannot open Type 1 font file|cannot open encoding file|Font \S+ at \d+ not found|Package babel Error: Unknown option/;

let packageNotice: ((message: string | null) => void) | null = null;

export function onTexPackage(
  listener: ((message: string | null) => void) | null,
): void {
  packageNotice = listener;
}

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

const memoryFonts = new Map<string, ArrayBuffer>();
let bundleBytes: Promise<ArrayBuffer> | null = null;

function loadBundle(): Promise<ArrayBuffer> {
  bundleBytes ??= fetch(asset(TEX_BUNDLE))
    .then((response) => {
      if (!response.ok) throw new Error("TeX файлууд татагдсангүй");
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      bundleBytes = null;
      throw error;
    });
  return bundleBytes;
}

async function loadCachedFonts(worker: Worker): Promise<void> {
  const cache = await fontCache();
  if (!cache) {
    for (const [name, data] of memoryFonts)
      sendFont(worker, name, data.slice(0));
    return;
  }
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

let warmed: Promise<boolean> | null = null;

function warmEngine(): Promise<boolean> {
  warmed ??= Promise.all([
    ...[TEX_ENGINE, TEX_ENGINE.replace(/\.js$/, ".wasm")].map((path) =>
      fetch(asset(path), { priority: "low" }).then((response) => {
        if (!response.ok) throw new Error(path);
      }),
    ),
    loadBundle(),
  ])
    .then(() => true)
    .catch(() => {
      warmed = null;
      return false;
    });
  return warmed;
}

async function persistStorage(): Promise<void> {
  try {
    if (navigator.storage && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch {}
}

let prefetching: Promise<boolean> | null = null;

export function prefetchFonts(): Promise<boolean> {
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData) return Promise.resolve(false);
  prefetching ??= (async () => {
    void persistStorage();
    const engineReady = warmEngine();
    await dropOldFontCaches();
    const cache = await fontCache();
    let complete = true;
    for (const name of TEX_FONT_FILES) {
      const url = asset(TEX_FONTS + name);
      if (cache ? await cache.match(url) : memoryFonts.has(name)) continue;
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
      if (!cache) memoryFonts.set(name, data.slice(0));
      else
        try {
          await cache.put(url, new Response(data.slice(0)));
        } catch {
          complete = false;
          break;
        }
      if (live) sendFont(live, name, data);
    }
    const ready = complete && (await engineReady);
    if (!ready) prefetching = null;
    return ready && cache !== null;
  })();
  return prefetching;
}

export const OFFLINE_KEY = at(KEYS.texOffline, TEX_BUNDLE + TEX_FONTS);

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
    const [bytes] = await Promise.all([loadBundle(), booted]);
    const files = unzipSync(new Uint8Array(bytes));
    engineFiles.set(worker, {
      bundled: new Set(Object.keys(files)),
      baseMap: files["pdftex.map"]?.slice() ?? null,
      installed: new Set(),
      maps: new Map(),
    });
    for (const [name, data] of Object.entries(files))
      worker.postMessage({ cmd: "writetex", name, src: data });
    worker.postMessage({
      cmd: "fonturl",
      url: new URL(asset(TEX_FONTS), location.href).href,
    });
    await loadCachedFonts(worker);
    await reinstallPackages(worker);
    live = worker;
    return worker;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

const COMPILE_TIMEOUT_MS = 30000;

function dropEngine(worker: Worker): void {
  worker.terminate();
  engine = null;
  if (live === worker) live = null;
}

let running: { stop: (reason: string) => void; since: number } | null =
  null;

export function cancelCompile(): void {
  running?.stop("TeX хөрвүүлэлтийг зогсоолоо");
}

export function compileRunningFor(): number {
  return running ? performance.now() - running.since : 0;
}

function runOnce(worker: Worker): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const stop = (reason: string): void => {
      clearTimeout(timer);
      running = null;
      dropEngine(worker);
      reject(new Error(reason));
    };
    const timer = setTimeout(
      () => stop("TeX хөрвүүлэлт хэт удаан үргэлжилсэн тул зогсоолоо"),
      COMPILE_TIMEOUT_MS,
    );
    running = { stop, since: performance.now() };
    worker.onmessage = (event: MessageEvent<EngineReply>) => {
      const reply = event.data;
      if (reply.cmd !== "compile") return;
      clearTimeout(timer);
      running = null;
      const pdf = replyPdf(reply);
      if (pdf) {
        resolve(new Uint8Array(pdf));
        return;
      }
      if (reply.status === ENGINE_CRASHED) dropEngine(worker);
      reject(new PdfError(reply.log ?? ""));
    };
    worker.postMessage({ cmd: "compilelatex" });
  });
}

export interface CompileLayout {
  readonly main: string;
  readonly dirs: readonly string[];
}

const SINGLE: CompileLayout = { main: "main.tex", dirs: [] };

type SourceFiles = Readonly<Record<string, Uint8Array | string>>;

async function compileOn(
  worker: Worker,
  tex: string,
  passes: number,
  files: SourceFiles,
  layout: CompileLayout,
): Promise<Uint8Array<ArrayBuffer>> {
  worker.postMessage({ cmd: "flushcache" });
  for (const url of layout.dirs) worker.postMessage({ cmd: "mkdir", url });
  for (const [url, src] of Object.entries(files))
    worker.postMessage({ cmd: "writefile", url, src });
  worker.postMessage({ cmd: "writefile", url: layout.main, src: tex });
  worker.postMessage({ cmd: "setmainfile", url: layout.main });
  let pdf = await runOnce(worker);
  for (let pass = 1; pass < passes; pass += 1) pdf = await runOnce(worker);
  return pdf;
}

const CROSS_REF =
  /\\(?:tableofcontents|listof(?:figures|tables)|ref|eqref|pageref|autoref|cite)\b/;

export interface TexDocument {
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly missing: readonly string[];
}

async function compileProjectDocument(): Promise<TexDocument> {
  const [{ projectBuild }, { withParatype }, { toPdfLatex }] =
    await Promise.all([
      import("./projectstore.ts"),
      import("./latex.ts"),
      import("./texcompat.ts"),
    ]);
  const build = await projectBuild();
  const tex = toPdfLatex(build.mainText);
  const layout = { main: build.main, dirs: build.dirs };
  try {
    return {
      pdf: await compilePdf(tex, build.passes, build.files, layout),
      missing: build.missing,
    };
  } catch (error) {
    const fallback = missingFont(error) ? withParatype(tex) : null;
    if (fallback === null) throw error;
    return {
      pdf: await compilePdf(fallback, build.passes, build.files, layout),
      missing: build.missing,
    };
  }
}

export async function compileTexDocument(text: string): Promise<TexDocument> {
  const { projectLinked } = await import("./projectstore.ts");
  if (projectLinked()) return compileProjectDocument();
  const [{ previewTex, withParatype }, { texImageFiles }, { toPdfLatex }] =
    await Promise.all([
      import("./latex.ts"),
      import("./teximages.ts"),
      import("./texcompat.ts"),
    ]);
  const images = await texImageFiles(text);
  const tex = toPdfLatex(previewTex(images.rewrite(text)));
  const passes = CROSS_REF.test(text) ? 2 : 1;
  try {
    return {
      pdf: await compilePdf(tex, passes, images.files),
      missing: images.missing,
    };
  } catch (error) {
    const fallback = missingFont(error) ? withParatype(tex) : null;
    if (fallback === null) throw error;
    return {
      pdf: await compilePdf(fallback, passes, images.files),
      missing: images.missing,
    };
  }
}

export async function compileTex(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return (await compileTexDocument(text)).pdf;
}

function askMisses(worker: Worker): Promise<string[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 2000);
    worker.onmessage = (
      event: MessageEvent<{ cmd?: string; names?: string[] }>,
    ) => {
      if (event.data.cmd !== "misses") return;
      clearTimeout(timer);
      resolve(event.data.names ?? []);
    };
    worker.postMessage({ cmd: "misses" });
  });
}

function writeMap(worker: Worker, state: EngineFiles): void {
  const parts = [state.baseMap ?? new Uint8Array(0), ...state.maps.values()];
  const newline = new Uint8Array([10]);
  const chunks = parts.flatMap((part) => [part, newline]);
  const size = chunks.reduce((sum, part) => sum + part.length, 0);
  const map = new Uint8Array(size);
  let at = 0;
  for (const part of chunks) {
    map.set(part, at);
    at += part.length;
  }
  worker.postMessage({ cmd: "writetex", name: "pdftex.map", src: map });
}

async function installPackage(worker: Worker, name: string): Promise<void> {
  const state = engineFiles.get(worker);
  if (!state || state.installed.has(name)) return;
  const { loadPackage } = await import("./texfetch.ts");
  packageNotice?.("«" + name + "» TeX багцыг ачаалж байна…");
  const pkg = await loadPackage(name);
  let mapsChanged = false;
  for (const map of pkg.maps) {
    const data = pkg.files.get(map);
    if (data && !state.maps.has(map)) {
      state.maps.set(map, data.slice());
      mapsChanged = true;
    }
  }
  for (const [file, data] of pkg.files)
    if (!state.bundled.has(file))
      worker.postMessage({ cmd: "writetex", name: file, src: data }, [
        data.buffer,
      ]);
  if (mapsChanged) writeMap(worker, state);
  state.installed.add(name);
  sessionPackages.add(name);
}

async function reinstallPackages(worker: Worker): Promise<void> {
  for (const name of sessionPackages)
    try {
      await installPackage(worker, name);
    } catch {}
}

async function addPackages(worker: Worker, log: string): Promise<boolean> {
  if (!PACKAGE_ERROR.test(log)) return false;
  const fetcher = await import("./texfetch.ts");
  if (!fetcher.packagesEnabled()) return false;
  const state = engineFiles.get(worker);
  if (!state) return false;
  const files = fetcher.wantedFiles(log, await askMisses(worker));
  if (!files.length) return false;
  const names = await fetcher.packagesFor(files, (name) =>
    state.installed.has(name),
  );
  if (!names.length) return false;
  for (const name of names) await installPackage(worker, name);
  return true;
}

async function compileWithPackages(
  tex: string,
  passes: number,
  files: SourceFiles,
  layout: CompileLayout,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    for (let round = 0; ; round += 1) {
      engine ??= start().catch((error: unknown) => {
        engine = null;
        throw error;
      });
      const worker = await engine;
      try {
        return await compileOn(worker, tex, passes, files, layout);
      } catch (error) {
        if (
          !(error instanceof PdfError) ||
          round >= PACKAGE_ROUNDS ||
          live !== worker
        )
          throw error;
        if (!(await addPackages(worker, error.log))) throw error;
      }
    }
  } finally {
    packageNotice?.(null);
  }
}

export function compilePdf(
  tex: string,
  passes = 1,
  files: SourceFiles = {},
  layout: CompileLayout = SINGLE,
): Promise<Uint8Array<ArrayBuffer>> {
  const job = queue.then(() => compileWithPackages(tex, passes, files, layout));
  queue = job.catch(() => undefined);
  return job;
}
