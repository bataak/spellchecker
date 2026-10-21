import type { SourceWord } from "../tex/texsync.ts";
import type { createHtmlSync } from "./htmlsync.ts";
import type { PdfView } from "./pdfview.ts";

const SYNC_MS = 250;
const SYNC_AFTER_EDIT_MS = 2000;

export interface SyncDeps {
  readonly area: HTMLTextAreaElement;
  readonly body: HTMLElement;
  readonly view: () => PdfView | null;
  readonly htmlSync: ReturnType<typeof createHtmlSync>;
  readonly texActive: () => boolean;
  readonly texPending: () => boolean;
  readonly htmlShown: () => boolean;
  readonly jump: (start: number, end: number) => void;
}

export interface PreviewSync {
  shown(): void;
  reveal(offset: number): void;
  flush(): Promise<void>;
  jumpAt(x: number, y: number, target: EventTarget | null): void;
  destroy(): void;
}

export const previewShown = (): boolean =>
  document.documentElement.dataset.preview === "on" ||
  document.documentElement.dataset.pane === "preview";

function createWordCache() {
  let cache: { text: string; words: readonly SourceWord[] } | null = null;
  return (
    text: string,
    sourceWords: (text: string) => readonly SourceWord[],
  ): readonly SourceWord[] => {
    if (cache?.text !== text) cache = { text, words: sourceWords(text) };
    return cache.words;
  };
}

function copyLayout(area: HTMLElement, body: HTMLElement): void {
  if (area.dataset.layout) body.dataset.layout = area.dataset.layout;
  else delete body.dataset.layout;
}

async function jumpFromPdf(
  deps: SyncDeps,
  wordsOf: ReturnType<typeof createWordCache>,
  view: PdfView,
  x: number,
  y: number,
): Promise<void> {
  const point = view.pointAt(x, y);
  if (!point) return;
  const [{ locateSource, pdfWordAt, sourceWords }, pdf] = await Promise.all([
    import("../tex/texsync.ts"),
    view.words(),
  ]);
  if (view !== deps.view()) return;
  const index = pdfWordAt(pdf, point.page, point.x, point.y);
  if (index < 0) return;
  const hit = locateSource(wordsOf(deps.area.value, sourceWords), pdf, index);
  if (hit) deps.jump(hit.at, hit.at + hit.word.length);
}

export function createPreviewSync(deps: SyncDeps): PreviewSync {
  const { area, body, htmlSync } = deps;
  let syncTimer = 0;
  let editedAt = -Infinity;
  let syncedAt = -1;
  let pendingReveal: number | null = null;
  const wordsOf = createWordCache();

  const revealOffset = async (offset: number): Promise<boolean> => {
    copyLayout(area, body);
    const view = deps.view();
    if (!deps.texActive()) {
      if (view || !deps.htmlShown()) return false;
      htmlSync.revealLine(area.value.slice(0, offset).split("\n").length - 1);
      return true;
    }
    if (!view) return false;
    const { locate, sourceWords } = await import("../tex/texsync.ts");
    const words = wordsOf(area.value, sourceWords);
    const pdf = await view.words();
    if (view !== deps.view()) return false;
    const hit = locate(words, offset, pdf);
    if (hit) view.reveal(hit.page, hit.y);
    return true;
  };

  const syncToCaret = async (): Promise<void> => {
    if (!previewShown() || document.activeElement !== area) return;
    if (deps.texPending()) return;
    const caret = area.selectionStart;
    if (caret === syncedAt) return;
    syncedAt = caret;
    if (!(await revealOffset(caret))) syncedAt = -1;
  };

  const flush = async (): Promise<void> => {
    const offset = pendingReveal;
    if (offset === null || !previewShown()) return;
    if ((await revealOffset(offset)) && pendingReveal === offset)
      pendingReveal = null;
  };

  const schedule = (): void => {
    clearTimeout(syncTimer);
    const typing = performance.now() - editedAt < SYNC_AFTER_EDIT_MS;
    syncTimer = window.setTimeout(
      () => void syncToCaret(),
      typing ? SYNC_AFTER_EDIT_MS : SYNC_MS,
    );
  };

  const jumpAt = (x: number, y: number, target: EventTarget | null): void => {
    const view = deps.view();
    if (deps.texActive() && view) {
      void jumpFromPdf(deps, wordsOf, view, x, y);
      return;
    }
    if (deps.texActive() || view || !deps.htmlShown()) return;
    if ((target as Element | null)?.closest("img, a, button, input")) return;
    htmlSync.jumpFrom(x, y);
  };

  const onEdit = (): void => {
    editedAt = performance.now();
    syncedAt = -1;
    pendingReveal = null;
  };
  const onSelection = (): void => {
    if (document.activeElement === area) schedule();
  };
  document.addEventListener("selectionchange", onSelection);
  area.addEventListener("input", onEdit);

  return {
    shown() {
      syncedAt = -1;
      schedule();
      void flush();
    },
    reveal(offset) {
      pendingReveal = offset;
    },
    flush,
    jumpAt,
    destroy() {
      clearTimeout(syncTimer);
      document.removeEventListener("selectionchange", onSelection);
      area.removeEventListener("input", onEdit);
    },
  };
}
