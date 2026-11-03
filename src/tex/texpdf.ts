import { unzipSync } from "fflate";
import type { TexProject } from "./projectbuild.ts";
import { TEX_ENGINE, TEX_FONTS } from "./texbundle.ts";
import { planPasses, runSteps } from "./texpasses.ts";
import { workerFiles } from "./texjobfiles.ts";
import {
  PdfError,
  missingFont,
  replyPdf,
  type EngineReply,
} from "./texerrors.ts";
import { session } from "./texsession.ts";
import { asset, loadBundle, loadCachedFonts } from "./texassets.ts";
import { engineFiles, reinstallPackages, addPackages } from "./texinstall.ts";

const ENGINE_CRASHED = -254;

const PACKAGE_ROUNDS = 8;

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
    session.live = worker;
    return worker;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

const COMPILE_TIMEOUT_MS = 30000;

function dropEngine(worker: Worker): void {
  worker.terminate();
  session.starting = null;
  if (session.live === worker) session.live = null;
}

export function cancelCompile(): void {
  session.running?.stop("TeX хөрвүүлэлтийг зогсоолоо");
}

export function compileRunningFor(): number {
  return session.running ? performance.now() - session.running.since : 0;
}

function runOnce(worker: Worker): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const stop = (reason: string): void => {
      clearTimeout(timer);
      session.running = null;
      dropEngine(worker);
      reject(new Error(reason));
    };
    const timer = setTimeout(
      () => stop("TeX хөрвүүлэлт хэт удаан үргэлжилсэн тул зогсоолоо"),
      COMPILE_TIMEOUT_MS,
    );
    session.running = { stop, since: performance.now() };
    worker.onmessage = (event: MessageEvent<EngineReply>) => {
      const reply = event.data;
      if (reply.cmd !== "compile") return;
      clearTimeout(timer);
      session.running = null;
      const pdf = replyPdf(reply);
      if (pdf) {
        resolve(new Uint8Array(pdf));
        return;
      }
      const crashed = reply.status === ENGINE_CRASHED;
      if (crashed) dropEngine(worker);
      reject(new PdfError(reply.log ?? "", crashed));
    };
    worker.postMessage({ cmd: "compilelatex" });
  });
}

export interface CompileLayout {
  readonly workdir: string;
  readonly main: string;
  readonly dirs: readonly string[];
}

const SINGLE: CompileLayout = { workdir: "", main: "main.tex", dirs: [] };

type SourceFiles = Readonly<Record<string, Uint8Array | string>>;

async function compileOn(
  worker: Worker,
  tex: string,
  files: SourceFiles,
  layout: CompileLayout,
): Promise<Uint8Array<ArrayBuffer>> {
  worker.postMessage({ cmd: "flushcache" });
  for (const url of layout.dirs) worker.postMessage({ cmd: "mkdir", url });
  for (const [url, src] of Object.entries(files))
    worker.postMessage({ cmd: "writefile", url, src });
  worker.postMessage({
    cmd: "writefile",
    url: layout.workdir ? layout.workdir + "/" + layout.main : layout.main,
    src: tex,
  });
  worker.postMessage({ cmd: "workdir", url: layout.workdir });
  worker.postMessage({ cmd: "setmainfile", url: layout.main });
  const texts = Object.values(files).filter(
    (src): src is string => typeof src === "string",
  );
  const plan = planPasses([tex, ...texts]);
  const job = workerFiles(worker, layout);
  let pdf = await runOnce(worker);
  for (let pass = 1; pass < plan.passes; pass += 1) {
    await runSteps(plan.steps, job);
    pdf = await runOnce(worker);
  }
  return pdf;
}

export interface TexDocument {
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly missing: readonly string[];
}

async function compileProjectDocument(
  project: TexProject,
): Promise<TexDocument> {
  const [{ withParatype }, { toPdfLatex }] = await Promise.all([
    import("./latexpreview.ts"),
    import("./texcompat.ts"),
  ]);
  const build = await project.build();
  const tex = toPdfLatex(build.mainText);
  const layout = {
    workdir: build.workdir,
    main: build.main,
    dirs: build.dirs,
  };
  try {
    return {
      pdf: await compilePdf(tex, build.files, layout),
      missing: build.missing,
    };
  } catch (error) {
    const fallback = missingFont(error) ? withParatype(tex) : null;
    if (fallback === null) throw error;
    return {
      pdf: await compilePdf(fallback, build.files, layout),
      missing: build.missing,
    };
  }
}

export async function compileTexDocument(
  text: string,
  project: TexProject | null = null,
): Promise<TexDocument> {
  if (project) return compileProjectDocument(project);
  const [{ previewTex, withParatype }, { texImageFiles }, { toPdfLatex }] =
    await Promise.all([
      import("./latexpreview.ts"),
      import("./teximages.ts"),
      import("./texcompat.ts"),
    ]);
  const images = await texImageFiles(text);
  const tex = toPdfLatex(previewTex(images.rewrite(text)));
  try {
    return {
      pdf: await compilePdf(tex, images.files),
      missing: images.missing,
    };
  } catch (error) {
    const fallback = missingFont(error) ? withParatype(tex) : null;
    if (fallback === null) throw error;
    return {
      pdf: await compilePdf(fallback, images.files),
      missing: images.missing,
    };
  }
}

export async function compileTex(
  text: string,
  project: TexProject | null = null,
): Promise<Uint8Array<ArrayBuffer>> {
  return (await compileTexDocument(text, project)).pdf;
}

async function compileWithPackages(
  tex: string,
  files: SourceFiles,
  layout: CompileLayout,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    for (let round = 0; ; round += 1) {
      session.starting ??= start().catch((error: unknown) => {
        session.starting = null;
        throw error;
      });
      const worker = await session.starting;
      try {
        return await compileOn(worker, tex, files, layout);
      } catch (error) {
        if (
          !(error instanceof PdfError) ||
          round >= PACKAGE_ROUNDS ||
          session.live !== worker
        )
          throw error;
        if (!(await addPackages(worker, error.log))) throw error;
      }
    }
  } finally {
    session.packageNotice?.(null);
  }
}

export function compilePdf(
  tex: string,
  files: SourceFiles = {},
  layout: CompileLayout = SINGLE,
): Promise<Uint8Array<ArrayBuffer>> {
  const job = session.queue.then(() => compileWithPackages(tex, files, layout));
  session.queue = job.catch(() => undefined);
  return job;
}
