import { isEditOf } from "../samedoc.ts";
import {
  cachedPdf,
  createPdfPool,
  digestOf,
  lastTex,
  type CompiledPdf,
} from "./pdfcache.ts";
import type { PdfPane } from "./pdfpane.ts";

const TEX_DELAY_MS = 700;
const RETRY_MS = [2000, 5000, 15000];
const STALE_COMPILE_MS = 3000;
const PREPARING = "PDF бэлтгэж байна…";

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
  readonly visible: () => boolean;
  readonly showNotice: (text: string) => void;
  readonly setError: (message: string | null) => void;
  readonly setMissing: (paths: readonly string[]) => void;
  readonly onShown: () => void;
  readonly onImagesChanged: () => void;
}

export interface TexPreview {
  active(): boolean;
  setActive(on: boolean): boolean;
  drop(): void;
  schedule(): void;
  recompile(): void;
  pdf(): Promise<CompiledPdf>;
  destroy(): void;
}

export function createTexPreview(deps: TexPreviewDeps): TexPreview {
  const { area, pane, compileBtn, downloadBtn, projectKey } = deps;
  const pool = createPdfPool();
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

  const cancelRetry = (): void => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
  };

  const current = (seq: number): boolean => seq === texSeq && texMode;

  const showBytes = async (
    bytes: Uint8Array<ArrayBuffer>,
    seq: number,
  ): Promise<boolean> => {
    const shown = await pane.showBytes(bytes, () => {
      if (!current(seq)) return false;
      drop();
      return true;
    });
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
    downloadBtn.disabled = pane.shown() === null;
    deps.setError(null);
    deps.setMissing(missing);
  };

  const stale = (text: string, project: boolean): boolean =>
    pane.view() !== null &&
    (pdfOfProject !== project ||
      (!project && (pdfText === null || !isEditOf(text, pdfText))));

  const render = async (): Promise<void> => {
    texTimer = 0;
    cancelRetry();
    const text = area.value;
    const project = projectKey();
    const key = texKey();
    if (!texMode || key === texShown || key === compiling || !deps.visible())
      return;
    if (key !== triedText) {
      triedText = key;
      retries = 0;
    }
    const seq = ++texSeq;
    const force = forced;
    forced = false;
    compileBtn.disabled = true;
    const kept = force ? undefined : pool.touch(key);
    if (kept) {
      const shown = await showBytes(kept.pdf, seq).catch(() => false);
      if (seq !== texSeq) return;
      compileBtn.disabled = false;
      if (shown) {
        showCompiled(key, kept.text, project, kept.missing);
        return;
      }
    }
    const digest = await digestOf(text, project);
    if (!current(seq)) return;
    const cached = digest === null || force ? null : await cachedPdf(digest);
    if (cached && (await showBytes(cached, seq).catch(() => false))) {
      pool.put(key, { text, pdf: cached, missing: [] });
      showCompiled(key, text, project, []);
      compileBtn.disabled = false;
      return;
    }
    if (!current(seq)) return;
    if (!texRestored && project === null) await restoreTex(text, seq);
    texRestored = true;
    if (!current(seq)) return;
    if (stale(text, project !== null)) {
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
    compiling = key;
    try {
      const [{ compileTexDocument, onTexPackage }, images] = await Promise.all([
        import("../tex/texpdf.ts"),
        import("../tex/teximages.ts"),
      ]);
      watchImages(images);
      onTexPackage((message) => {
        if (current(seq) && !pane.view()) deps.showNotice(message ?? PREPARING);
      });
      const { pdf, missing } = await pool.compile(key, () =>
        compileTexDocument(text),
      );
      pool.keep(key, { text, pdf, missing }, digest, project);
      if (!(await showBytes(pdf, seq))) return;
      retries = 0;
      showCompiled(key, text, project, missing);
    } catch (error) {
      if (!current(seq)) return;
      texShown = key;
      const delay = RETRY_MS[retries];
      const message =
        explainTexError(error, window.isSecureContext) +
        (delay ? " — дахин оролдож байна…" : "");
      if (pane.view()) deps.setError(message);
      else deps.showNotice(message);
      if (delay) {
        retries++;
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          if (!texMode || texKey() !== key) return;
          texShown = null;
          void render();
        }, delay);
      }
    } finally {
      if (compiling === key) compiling = null;
      if (seq === texSeq) compileBtn.disabled = false;
    }
  };

  return {
    active: () => texMode,
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
      if (texKey() !== texShown) downloadBtn.disabled = true;
      const project = deps.inProject();
      if (
        pane.view() &&
        (pdfOfProject !== project ||
          (!project && pdfText !== null && !isEditOf(area.value, pdfText)))
      ) {
        drop();
        deps.setError(null);
        deps.setMissing([]);
      }
      if (texTimer) clearTimeout(texTimer);
      texTimer = window.setTimeout(
        () => void render(),
        texShown === null ? 0 : TEX_DELAY_MS,
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
        const digest = await digestOf(text, project);
        const cached = digest === null ? null : await cachedPdf(digest);
        if (cached) return { pdf: cached, missing: [] };
        const { compileTexDocument } = await import("../tex/texpdf.ts");
        const { pdf, missing } = await pool.compile(key, () =>
          compileTexDocument(text),
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
}
