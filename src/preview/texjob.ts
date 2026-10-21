import { isEditOf } from "../editor/samedoc.ts";
import { tidyTex } from "../tex/textidy.ts";
import { onTexImagesChange } from "../tex/teximages.ts";
import {
  cachedPdf,
  digestOf,
  lastTex,
  type createPdfPool,
} from "./pdfcache.ts";
import { tooSlowForAuto } from "./compilemode.ts";
import type { TexPreviewDeps } from "./texpreview.ts";

const RETRY_MS = [2000, 5000, 15000];
const STALE_COMPILE_MS = 3000;
export const PREPARING = "PDF бэлтгэж байна…";
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

export interface TexState {
  auto: boolean;
  lastCompileMs: number;
  texMode: boolean;
  texShown: string | null;
  pdfText: string | null;
  texTimer: number;
  texSeq: number;
  texRestored: boolean;
  pdfOfProject: boolean;
  retryTimer: number;
  retries: number;
  triedText: string | null;
  compiling: string | null;
  savingPdf: number;
  forced: boolean;
  offTexImages: (() => void) | null;
  shownMissing: readonly string[];
  scheduled: { readonly key: string; readonly text: string } | null;
  tidyMemo: { readonly from: string; readonly to: string } | null;
}

export interface TexCtx {
  readonly deps: TexPreviewDeps;
  readonly pool: ReturnType<typeof createPdfPool>;
  readonly st: TexState;
  readonly setAuto: (on: boolean, note?: string | null) => void;
}

interface Job {
  readonly seq: number;
  readonly key: string;
  readonly text: string;
  readonly project: string | null;
  readonly force: boolean;
}

export function texKey(c: TexCtx): string {
  const project = c.deps.projectKey();
  return project === null ? c.deps.area.value : "\u0000project:" + project;
}

export function drop(c: TexCtx): void {
  c.deps.downloadBtn.disabled = true;
  c.st.pdfText = null;
  c.st.texShown = null;
  c.deps.pane.drop();
}

export function cancelRetry(c: TexCtx): void {
  if (c.st.retryTimer) clearTimeout(c.st.retryTimer);
  c.st.retryTimer = 0;
}

const current = (c: TexCtx, seq: number): boolean =>
  seq === c.st.texSeq && c.st.texMode;

async function showBytes(
  c: TexCtx,
  bytes: Uint8Array<ArrayBuffer>,
  seq: number,
): Promise<boolean> {
  const shown = await c.deps.pane.showBytes(bytes, () => current(c, seq));
  if (shown) c.deps.onShown();
  return shown;
}

function watchImages(c: TexCtx): void {
  if (c.st.offTexImages) return;
  c.st.offTexImages = onTexImagesChange(() => {
    if (!c.st.texMode) return;
    c.st.texShown = null;
    c.st.forced = true;
    c.deps.onImagesChanged();
  });
}

async function restoreTex(c: TexCtx, text: string, seq: number): Promise<void> {
  c.st.texRestored = true;
  const last = await lastTex();
  if (!last || !current(c, seq) || !isEditOf(text, last.text)) return;
  const bytes = await cachedPdf(last.digest);
  if (!bytes || !current(c, seq)) return;
  if (await showBytes(c, bytes, seq).catch(() => false)) {
    c.st.pdfText = last.text;
    c.st.pdfOfProject = false;
  }
}

function showCompiled(
  c: TexCtx,
  key: string,
  text: string,
  project: string | null,
  missing: readonly string[],
): void {
  const { st, deps } = c;
  st.texRestored = true;
  st.pdfText = text;
  st.pdfOfProject = project !== null;
  st.texShown = key;
  st.shownMissing = missing;
  deps.downloadBtn.disabled = deps.pane.shown() === null;
  deps.setError(null);
  deps.setMissing(missing);
}

export function keepTidied(c: TexCtx): boolean {
  const { st, deps } = c;
  const pdf = deps.pane.shown();
  const text = deps.area.value;
  if (
    deps.projectKey() !== null ||
    st.pdfOfProject ||
    !pdf ||
    !deps.pane.view()
  )
    return false;
  if (st.pdfText === null || st.texShown !== st.pdfText || text === st.pdfText)
    return false;
  if (st.tidyMemo?.from !== st.pdfText)
    st.tidyMemo = { from: st.pdfText, to: tidyTex(st.pdfText) };
  if (st.tidyMemo.to !== text) return false;
  c.pool.put(text, { text, pdf, missing: st.shownMissing });
  st.pdfText = text;
  st.texShown = text;
  return true;
}

const stale = (c: TexCtx, text: string, project: boolean): boolean =>
  c.deps.pane.view() !== null &&
  (c.st.pdfOfProject !== project ||
    (!project && (c.st.pdfText === null || !isEditOf(text, c.st.pdfText))));

function begin(c: TexCtx): Job | null {
  const { st, deps } = c;
  st.texTimer = 0;
  cancelRetry(c);
  const text = deps.area.value;
  const project = deps.projectKey();
  const key = texKey(c);
  if (
    !st.texMode ||
    key === st.texShown ||
    key === st.compiling ||
    !deps.visible()
  )
    return null;
  if (key !== st.triedText) {
    st.triedText = key;
    st.retries = 0;
  }
  const seq = ++st.texSeq;
  const force = st.forced;
  st.forced = false;
  deps.compileBtn.disabled = true;
  return { seq, key, text, project, force };
}

async function showPooled(
  c: TexCtx,
  job: Job,
): Promise<"shown" | "stale" | "miss"> {
  const kept = job.force ? undefined : c.pool.touch(job.key);
  if (!kept) return "miss";
  const shown = await showBytes(c, kept.pdf, job.seq).catch(() => false);
  if (job.seq !== c.st.texSeq) return "stale";
  c.deps.compileBtn.disabled = false;
  if (!shown) return "miss";
  showCompiled(c, job.key, kept.text, job.project, kept.missing);
  return "shown";
}

async function showCached(
  c: TexCtx,
  job: Job,
  digest: string | null,
): Promise<boolean> {
  const cached = digest === null || job.force ? null : await cachedPdf(digest);
  if (!cached || !(await showBytes(c, cached, job.seq).catch(() => false)))
    return false;
  c.pool.put(job.key, { text: job.text, pdf: cached, missing: [] });
  showCompiled(c, job.key, job.text, job.project, []);
  c.deps.compileBtn.disabled = false;
  return true;
}

async function prepareCompile(c: TexCtx, job: Job): Promise<boolean> {
  const { st, deps } = c;
  if (!current(c, job.seq)) return false;
  if (!st.texRestored && job.project === null)
    await restoreTex(c, job.text, job.seq);
  st.texRestored = true;
  if (!current(c, job.seq)) return false;
  if (stale(c, job.text, job.project !== null)) {
    drop(c);
    deps.setError(null);
  }
  if (!deps.pane.view()) {
    deps.showNotice(PREPARING);
    st.texShown = null;
  }
  void import("../tex/texpdf.ts").then((mod) => {
    if (!st.savingPdf && mod.compileRunningFor() > STALE_COMPILE_MS)
      mod.cancelCompile();
  });
  return true;
}

function failed(c: TexCtx, job: Job, error: unknown): void {
  const { st, deps } = c;
  if (!current(c, job.seq)) return;
  st.texShown = job.key;
  const delay = RETRY_MS[st.retries];
  const message =
    explainTexError(error, window.isSecureContext) +
    (delay ? " — дахин оролдож байна…" : "");
  if (deps.pane.view()) deps.setError(message);
  else deps.showNotice(message);
  if (!delay) return;
  st.retries++;
  st.retryTimer = window.setTimeout(() => {
    st.retryTimer = 0;
    if (!st.texMode || texKey(c) !== job.key) return;
    st.texShown = null;
    void render(c);
  }, delay);
}

async function compileJob(
  c: TexCtx,
  job: Job,
  digest: string | null,
): Promise<void> {
  const { st, deps } = c;
  const { seq, key, text, project } = job;
  st.compiling = key;
  try {
    const { compileTexDocument, onTexPackage } =
      await import("../tex/texpdf.ts");
    watchImages(c);
    let fetched = false;
    onTexPackage((message) => {
      if (message) fetched = true;
      if (current(c, seq) && !deps.pane.view())
        deps.showNotice(message ?? PREPARING);
    });
    const started = performance.now();
    const { pdf, missing } = await c.pool.compile(key, () =>
      compileTexDocument(text, deps.texProject()),
    );
    const took = performance.now() - started;
    if (!fetched) st.lastCompileMs = took;
    if (st.auto && tooSlowForAuto(took, fetched))
      c.setAuto(false, AUTO_OFF_NOTE);
    c.pool.keep(key, { text, pdf, missing }, digest, project);
    if (!(await showBytes(c, pdf, seq))) return;
    st.retries = 0;
    showCompiled(c, key, text, project, missing);
  } catch (error) {
    failed(c, job, error);
  } finally {
    if (st.compiling === key) st.compiling = null;
    if (seq === st.texSeq) deps.compileBtn.disabled = false;
  }
}

export async function render(c: TexCtx): Promise<void> {
  const job = begin(c);
  if (!job) return;
  if ((await showPooled(c, job)) !== "miss") return;
  const digest = await digestOf(
    job.text,
    job.project === null ? null : c.deps.texProject(),
  );
  if (!current(c, job.seq)) return;
  if (await showCached(c, job, digest)) return;
  if (!(await prepareCompile(c, job))) return;
  await compileJob(c, job, digest);
}
