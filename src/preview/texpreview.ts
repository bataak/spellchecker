import { isEditOf } from "../editor/samedoc.ts";
import { tidyTex } from "../tex/textidy.ts";
import {
  cachedPdf,
  createPdfPool,
  digestOf,
  lastTex,
  type CompiledPdf,
} from "./pdfcache.ts";
import type { PdfPane } from "./pdfpane.ts";
import type { TexProject } from "../project/projectbuild.ts";
import { KEYS, read, write } from "../core/store.ts";
import { autoDelay, tooSlowForAuto } from "./compilemode.ts";

const RETRY_MS = [2000, 5000, 15000];
const STALE_COMPILE_MS = 3000;
const PREPARING = "PDF бэлтгэж байна…";
export const AUTO_OFF_NOTE =
  "Баримт том тул автомат хөрвүүлэлтийг зогсоолоо. Хөрвүүлэх товч эсвэл Ctrl+Enter ашиглана уу. Удаан дарвал автомат горимд буцна.";

const NETWORK_ERROR =
  /fake worker|dynamically imported module|Failed to fetch|NetworkError|Load failed|татагдсангүй|ачаалагдсангүй/i;

export function explainTexError(error: unknown, secure: boolean): string {
  const message = error instanceof Error ? error.message : "";
  if (!NETWORK_ERROR.test(message)) return message || "PDF үүсгэж чадсангүй";
  if (!secure)
    return "Сервертэй холбогдож чадсангүй. Энэ хаяг HTTPS биш тул офлайн горим ажиллахгүй, localhost эсвэл HTTPS хаягаар нээнэ үү";
  return "Сервертэй холбогдож чадсангүй. Офлайн ажиллахын тулд нэг удаа онлайн үед хөрвүүлсэн байх шаардлагатай";
}

export interface TexPreviewDeps {
  readonly area: HTMLTextAreaElement;
  readonly pane: PdfPane;
  readonly compileBtn: HTMLButtonElement;
  readonly downloadBtn: HTMLButtonElement;
  readonly projectKey: () => string | null;
  readonly inProject: () => boolean;
  readonly texProject: () => TexProject | null;
  readonly visible: () => boolean;
  readonly showNotice: (text: string) => void;
  readonly setError: (message: string | null) => void;
  readonly setMissing: (paths: readonly string[]) => void;
  readonly onShown: () => void;
  readonly onImagesChanged: () => void;
  readonly onModeChange: (auto: boolean, note: string | null) => void;
}

export interface TexPreview {
  active(): boolean;
  pending(): boolean;
  setActive(on: boolean): boolean;
  drop(): void;
  schedule(): void;
  recompile(): void;
  auto(): boolean;
  setAuto(on: boolean, note?: string | null): void;
  compileNow(): void;
  pdf(): Promise<CompiledPdf>;
  destroy(): void;
}

export function createTexPreview(deps: TexPreviewDeps): TexPreview {
  const { area, pane, compileBtn, downloadBtn, projectKey } = deps;
  const pool = createPdfPool();
  let auto = read(KEYS.texAuto) !== "0";
  let lastCompileMs = 0;
  let texMode = false;
  let texShown: string | null = null;
  let pdfText: string | null = null;
  let texTimer = 0;
  let texSeq = 0;
  let texRestored = false;
  let pdfOfProject = false;
  let retryTimer = 0;
  let retries = 0;
  let triedText: string | null = null;
  let compiling: string | null = null;
  let savingPdf = 0;
  let forced = false;
  let offTexImages: (() => void) | null = null;
  let shownMissing: readonly string[] = [];
  let scheduled: { readonly key: string; readonly text: string } | null = null;
  let tidyMemo: { readonly from: string; readonly to: string } | null = null;

  const texKey = (): string => {
    const project = projectKey();
    return project === null ? area.value : "\u0000project:" + project;
  };

  const drop = (): void => {
    downloadBtn.disabled = true;
    pdfText = null;
    texShown = null;
    pane.drop();
  };

  const cancelTimer = (): void => {
    if (texTimer) clearTimeout(texTimer);
    texTimer = 0;
    scheduled = null;
  };

  const cancelRetry = (): void => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
  };

  const current = (seq: number): boolean => seq === texSeq && texMode;

  const showBytes = async (
    bytes: Uint8Array<ArrayBuffer>,
    seq: number,
  ): Promise<boolean> => {
    const shown = await pane.showBytes(bytes, () => current(seq));
    if (shown) deps.onShown();
    return shown;
  };

  const watchImages = (mod: typeof import("../tex/teximages.ts")): void => {
    if (offTexImages) return;
    offTexImages = mod.onTexImagesChange(() => {
      if (!texMode) return;
      texShown = null;
      forced = true;
      deps.onImagesChanged();
    });
  };

  const restoreTex = async (text: string, seq: number): Promise<void> => {
    texRestored = true;
    const last = await lastTex();
    if (!last || !current(seq) || !isEditOf(text, last.text)) return;
    const bytes = await cachedPdf(last.digest);
    if (!bytes || !current(seq)) return;
    if (await showBytes(bytes, seq).catch(() => false)) {
      pdfText = last.text;
      pdfOfProject = false;
    }
  };

  const showCompiled = (
    key: string,
    text: string,
    project: string | null,
    missing: readonly string[],
  ): void => {
    texRestored = true;
    pdfText = text;
    pdfOfProject = project !== null;
    texShown = key;
    shownMissing = missing;
    downloadBtn.disabled = pane.shown() === null;
    deps.setError(null);
    deps.setMissing(missing);
  };

  const keepTidied = (): boolean => {
    const pdf = pane.shown();
    const text = area.value;
    if (projectKey() !== null || pdfOfProject || !pdf || !pane.view())
      return false;
    if (pdfText === null || texShown !== pdfText || text === pdfText)
      return false;
    if (tidyMemo?.from !== pdfText)
      tidyMemo = { from: pdfText, to: tidyTex(pdfText) };
    if (tidyMemo.to !== text) return false;
    pool.put(text, { text, pdf, missing: shownMissing });
    pdfText = text;
    texShown = text;
    return true;
  };

  const stale = (text: string, project: boolean): boolean =>
    pane.view() !== null &&
    (pdfOfProject !== project ||
      (!project && (pdfText === null || !isEditOf(text, pdfText))));

  interface Job {
    readonly seq: number;
    readonly key: string;
    readonly text: string;
    readonly project: string | null;
    readonly force: boolean;
  }

  const begin = (): Job | null => {
    texTimer = 0;
    cancelRetry();
    const text = area.value;
    const project = projectKey();
    const key = texKey();
    if (!texMode || key === texShown || key === compiling || !deps.visible())
      return null;
    if (key !== triedText) {
      triedText = key;
      retries = 0;
    }
    const seq = ++texSeq;
    const force = forced;
    forced = false;
    compileBtn.disabled = true;
    return { seq, key, text, project, force };
  };

  const showPooled = async (job: Job): Promise<"shown" | "stale" | "miss"> => {
    const kept = job.force ? undefined : pool.touch(job.key);
    if (!kept) return "miss";
    const shown = await showBytes(kept.pdf, job.seq).catch(() => false);
    if (job.seq !== texSeq) return "stale";
    compileBtn.disabled = false;
    if (!shown) return "miss";
    showCompiled(job.key, kept.text, job.project, kept.missing);
    return "shown";
  };

  const showCached = async (
    job: Job,
    digest: string | null,
  ): Promise<boolean> => {
    const cached =
      digest === null || job.force ? null : await cachedPdf(digest);
    if (!cached || !(await showBytes(cached, job.seq).catch(() => false)))
      return false;
    pool.put(job.key, { text: job.text, pdf: cached, missing: [] });
    showCompiled(job.key, job.text, job.project, []);
    compileBtn.disabled = false;
    return true;
  };

  const prepareCompile = async (job: Job): Promise<boolean> => {
    if (!current(job.seq)) return false;
    if (!texRestored && job.project === null)
      await restoreTex(job.text, job.seq);
    texRestored = true;
    if (!current(job.seq)) return false;
    if (stale(job.text, job.project !== null)) {
      drop();
      deps.setError(null);
    }
    if (!pane.view()) {
      deps.showNotice(PREPARING);
      texShown = null;
    }
    void import("../tex/texpdf.ts").then((mod) => {
      if (!savingPdf && mod.compileRunningFor() > STALE_COMPILE_MS)
        mod.cancelCompile();
    });
    return true;
  };

  const failed = (job: Job, error: unknown): void => {
    if (!current(job.seq)) return;
    texShown = job.key;
    const delay = RETRY_MS[retries];
    const message =
      explainTexError(error, window.isSecureContext) +
      (delay ? " — дахин оролдож байна…" : "");
    if (pane.view()) deps.setError(message);
    else deps.showNotice(message);
    if (!delay) return;
    retries++;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      if (!texMode || texKey() !== job.key) return;
      texShown = null;
      void render();
    }, delay);
  };

  const compileJob = async (job: Job, digest: string | null): Promise<void> => {
    const { seq, key, text, project } = job;
    compiling = key;
    try {
      const [{ compileTexDocument, onTexPackage }, images] = await Promise.all([
        import("../tex/texpdf.ts"),
        import("../tex/teximages.ts"),
      ]);
      watchImages(images);
      let fetched = false;
      onTexPackage((message) => {
        if (message) fetched = true;
        if (current(seq) && !pane.view()) deps.showNotice(message ?? PREPARING);
      });
      const started = performance.now();
      const { pdf, missing } = await pool.compile(key, () =>
        compileTexDocument(text, deps.texProject()),
      );
      const took = performance.now() - started;
      if (!fetched) lastCompileMs = took;
      if (auto && tooSlowForAuto(took, fetched))
        api.setAuto(false, AUTO_OFF_NOTE);
      pool.keep(key, { text, pdf, missing }, digest, project);
      if (!(await showBytes(pdf, seq))) return;
      retries = 0;
      showCompiled(key, text, project, missing);
    } catch (error) {
      failed(job, error);
    } finally {
      if (compiling === key) compiling = null;
      if (seq === texSeq) compileBtn.disabled = false;
    }
  };

  const render = async (): Promise<void> => {
    const job = begin();
    if (!job) return;
    if ((await showPooled(job)) !== "miss") return;
    const digest = await digestOf(
      job.text,
      job.project === null ? null : deps.texProject(),
    );
    if (!current(job.seq)) return;
    if (await showCached(job, digest)) return;
    if (!(await prepareCompile(job))) return;
    await compileJob(job, digest);
  };

  const api: TexPreview = {
    active: () => texMode,
    pending: () => texMode && texKey() !== texShown,
    setActive(on) {
      if (on === texMode) return false;
      texMode = on;
      texSeq++;
      texRestored = false;
      compiling = null;
      cancelRetry();
      compileBtn.disabled = false;
      if (texTimer) clearTimeout(texTimer);
      texTimer = 0;
      drop();
      deps.setError(null);
      deps.setMissing([]);
      return true;
    },
    drop,
    schedule() {
      if (keepTidied()) return;
      if (texKey() !== texShown) downloadBtn.disabled = true;
      const project = deps.inProject();
      if (
        pane.view() &&
        (pdfOfProject !== project ||
          (!project && pdfText !== null && !isEditOf(area.value, pdfText)))
      ) {
        texSeq++;
        drop();
        deps.setError(null);
        deps.setMissing([]);
      }
      const key = texKey();
      const text = area.value;
      if (!auto && texShown !== null) {
        cancelTimer();
        return;
      }
      if (texTimer && scheduled?.key === key && scheduled.text === text) return;
      scheduled = { key, text };
      if (texTimer) clearTimeout(texTimer);
      texTimer = window.setTimeout(
        () => void render(),
        texShown === null ? 0 : autoDelay(lastCompileMs),
      );
    },
    recompile() {
      if (compiling !== null) return;
      forced = true;
      retries = 0;
      triedText = null;
      texShown = null;
      void render();
    },
    auto: () => auto,
    setAuto(on, note = null) {
      if (on === auto) return;
      auto = on;
      write(KEYS.texAuto, on ? "1" : "0");
      deps.onModeChange(on, note);
      if (!on) cancelTimer();
      else if (texMode && texKey() !== texShown) {
        cancelTimer();
        void render();
      }
    },
    compileNow() {
      api.setAuto(false);
      if (!texMode || compiling !== null) return;
      if (texKey() === texShown) {
        api.recompile();
        return;
      }
      cancelTimer();
      void render();
    },
    async pdf() {
      const text = area.value;
      const project = projectKey();
      const key = texKey();
      const kept = pool.get(key);
      if (kept) return kept;
      const shown = pane.shown();
      if (texMode && shown && !downloadBtn.disabled && texShown === key)
        return { pdf: shown, missing: [] };
      savingPdf++;
      try {
        const running = pool.running(key);
        if (running) {
          const result = await running.catch(() => null);
          if (result) return result;
        }
        const digest = await digestOf(
          text,
          project === null ? null : deps.texProject(),
        );
        const cached = digest === null ? null : await cachedPdf(digest);
        if (cached) return { pdf: cached, missing: [] };
        const { compileTexDocument } = await import("../tex/texpdf.ts");
        const { pdf, missing } = await pool.compile(key, () =>
          compileTexDocument(text, deps.texProject()),
        );
        pool.keep(key, { text, pdf, missing }, digest, project);
        return { pdf, missing };
      } finally {
        savingPdf--;
      }
    },
    destroy() {
      if (texTimer) clearTimeout(texTimer);
      cancelRetry();
      drop();
      offTexImages?.();
    },
  };
  return api;
}
