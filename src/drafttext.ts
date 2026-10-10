import {
  initDraftStorage,
  saveDraft,
  flushDraft,
  loadDraft,
} from "./storage.ts";

export interface DraftTextDeps {
  readonly editor: HTMLTextAreaElement;
  readonly setStatus: (html: string) => void;
  readonly onLoaded: () => void;
  readonly onCaret: (caret: { start: number; end: number }) => void;
}

export interface DraftText {
  readonly save: () => void;
  readonly saveSoon: () => void;
  readonly load: () => Promise<void>;
  readonly restoreBootScroll: () => void;
  readonly dropBootScroll: () => void;
}

const CARET_KEY = "mn-spell:caret";

export function initDraftText(deps: DraftTextDeps): DraftText {
  const { editor } = deps;
  let storageWarned = false;

  function warnStorageFailure(): void {
    if (storageWarned) return;
    storageWarned = true;
    deps.setStatus(
      "Анхаар: бичвэр автоматаар хадгалагдсангүй — " +
        "хаахаасаа өмнө файл болгож хадгална уу",
    );
  }
  initDraftStorage({ onError: warnStorageFailure });

  function saveCaret(): void {
    try {
      const selectionStart = editor.selectionStart;
      const selectionEnd = editor.selectionEnd;
      if (selectionStart != null)
        localStorage.setItem(
          CARET_KEY,
          selectionStart + "," + selectionEnd + "," + editor.scrollTop,
        );
    } catch (_) {}
  }

  function save(): void {
    saveDraft(editor.value);
    saveCaret();
  }

  let bootScroll: number | null = null;

  function restoreBootScroll(): void {
    if (bootScroll == null) return;
    const max = editor.scrollHeight - editor.clientHeight;
    editor.scrollTop = Math.min(bootScroll, Math.max(0, max));
  }

  function dropBootScroll(): void {
    bootScroll = null;
  }

  async function load(): Promise<void> {
    try {
      const draftText = await loadDraft();
      if (draftText != null) {
        editor.value = draftText;
        deps.onLoaded();
      }
      const savedCaretRaw = localStorage.getItem(CARET_KEY);
      if (savedCaretRaw != null) {
        const parts = savedCaretRaw.split(",");
        const len = editor.value.length;
        const start = Math.min(Math.max(0, parseInt(parts[0], 10) || 0), len);
        const end = Math.min(
          Math.max(start, parseInt(parts[1], 10) || start),
          len,
        );
        try {
          editor.setSelectionRange(start, end);
        } catch (_) {}
        deps.onCaret({ start, end });
        const top = parseFloat(parts[2] ?? "");
        if (Number.isFinite(top) && top > 0) bootScroll = top;
      }
    } catch (_) {}
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function saveSoon(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  let caretTimer: ReturnType<typeof setTimeout> | null = null;
  function saveCaretSoon(): void {
    if (bootScroll != null) return;
    if (caretTimer) clearTimeout(caretTimer);
    caretTimer = setTimeout(saveCaret, 250);
  }
  editor.addEventListener("scroll", saveCaretSoon, { passive: true });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editor) saveCaretSoon();
  });
  window.addEventListener("pagehide", () => {
    save();
    flushDraft();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      save();
      flushDraft();
    }
  });

  return { save, saveSoon, load, restoreBootScroll, dropBootScroll };
}
