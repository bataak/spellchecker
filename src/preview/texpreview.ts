import { isEditOf } from "../editor/samedoc.ts";
import {
  cachedPdf,
  createPdfPool,
  digestOf,
  type CompiledPdf,
} from "./pdfcache.ts";
import type { PdfPane } from "./pdfpane.ts";
import type { TexProject } from "../project/projectbuild.ts";
import { KEYS, read, write } from "../core/store.ts";
import { autoDelay } from "./compilemode.ts";
import { HELD_NOTE, releaseTexCompile, texCompileHeld } from "./texhold.ts";
import {
  cancelRetry,
  drop,
  keepTidied,
  render,
  texKey,
  type TexCtx,
} from "./texjob.ts";

export { AUTO_OFF_NOTE, explainTexError } from "./texjob.ts";

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

function cancelTimer(c: TexCtx): void {
  if (c.st.texTimer) clearTimeout(c.st.texTimer);
  c.st.texTimer = 0;
  c.st.scheduled = null;
}

function schedule(c: TexCtx): void {
  const { st, deps } = c;
  if (keepTidied(c)) return;
  if (texKey(c) !== st.texShown) deps.downloadBtn.disabled = true;
  const project = deps.inProject();
  if (
    deps.pane.view() &&
    (st.pdfOfProject !== project ||
      (!project &&
        st.pdfText !== null &&
        !isEditOf(deps.area.value, st.pdfText)))
  ) {
    st.texSeq++;
    drop(c);
    deps.setError(null);
    deps.setMissing([]);
  }
  const key = texKey(c);
  const text = deps.area.value;
  if (texCompileHeld(text)) {
    cancelTimer(c);
    deps.showNotice(HELD_NOTE);
    return;
  }
  if (!st.auto && st.texShown !== null) {
    cancelTimer(c);
    return;
  }
  if (st.texTimer && st.scheduled?.key === key && st.scheduled.text === text)
    return;
  st.scheduled = { key, text };
  if (st.texTimer) clearTimeout(st.texTimer);
  st.texTimer = window.setTimeout(
    () => void render(c),
    st.texShown === null ? 0 : autoDelay(st.lastCompileMs),
  );
}

async function exportPdf(c: TexCtx): Promise<CompiledPdf> {
  const { st, deps, pool } = c;
  const text = deps.area.value;
  const project = deps.projectKey();
  const key = texKey(c);
  const kept = pool.get(key);
  if (kept) return kept;
  const shown = deps.pane.shown();
  if (st.texMode && shown && !deps.downloadBtn.disabled && st.texShown === key)
    return { pdf: shown, missing: st.shownMissing };
  st.savingPdf++;
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
    st.savingPdf--;
  }
}

export function createTexPreview(deps: TexPreviewDeps): TexPreview {
  const c: TexCtx = {
    deps,
    pool: createPdfPool(),
    st: {
      auto: read(KEYS.texAuto) !== "0",
      lastCompileMs: 0,
      texMode: false,
      texShown: null,
      pdfText: null,
      texTimer: 0,
      texSeq: 0,
      texRestored: false,
      pdfOfProject: false,
      retryTimer: 0,
      retries: 0,
      triedText: null,
      compiling: null,
      savingPdf: 0,
      forced: false,
      offTexImages: null,
      shownMissing: [],
      scheduled: null,
      tidyMemo: null,
    },
    setAuto: (on, note) => api.setAuto(on, note),
  };
  const { st } = c;
  const api: TexPreview = {
    active: () => st.texMode,
    pending: () =>
      st.texMode &&
      texKey(c) !== st.texShown &&
      (st.auto || st.texTimer !== 0 || st.compiling !== null),
    setActive(on) {
      if (on === st.texMode) return false;
      st.texMode = on;
      st.texSeq++;
      st.texRestored = false;
      st.compiling = null;
      cancelRetry(c);
      deps.compileBtn.disabled = false;
      cancelTimer(c);
      drop(c);
      deps.setError(null);
      deps.setMissing([]);
      return true;
    },
    drop: () => drop(c),
    schedule: () => schedule(c),
    recompile() {
      if (st.compiling !== null) return;
      releaseTexCompile();
      st.forced = true;
      st.retries = 0;
      st.triedText = null;
      st.texShown = null;
      void render(c);
    },
    auto: () => st.auto,
    setAuto(on, note = null) {
      if (on === st.auto) return;
      st.auto = on;
      write(KEYS.texAuto, on ? "1" : "0");
      deps.onModeChange(on, note);
      if (!on) cancelTimer(c);
      else if (
        st.texMode &&
        texKey(c) !== st.texShown &&
        !texCompileHeld(deps.area.value)
      ) {
        cancelTimer(c);
        void render(c);
      }
    },
    compileNow() {
      releaseTexCompile();
      api.setAuto(false);
      if (!st.texMode || st.compiling !== null) return;
      if (texKey(c) === st.texShown) {
        api.recompile();
        return;
      }
      cancelTimer(c);
      void render(c);
    },
    pdf: () => exportPdf(c),
    destroy() {
      cancelTimer(c);
      cancelRetry(c);
      drop(c);
      st.offTexImages?.();
    },
  };
  return api;
}
