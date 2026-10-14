import { loadDraft, loadDraftFile, saveDraftFile } from "./storage.ts";

export interface SlotStore {
  readonly slot: () => string;
  readonly shared: () => string;
  readonly read: (slot: string) => Promise<string | null>;
  readonly write: (slot: string, text: string) => void;
  readonly caret: (
    slot: string,
  ) => { start: number; end: number; scroll: number } | null;
  readonly writeCaret: (
    slot: string,
    caret: { start: number; end: number; scroll: number },
  ) => void;
}

export interface DraftTextDeps {
  readonly editor: HTMLTextAreaElement;
  readonly onLoaded: () => void;
  readonly onCaret: (caret: { start: number; end: number }) => void;
  readonly store: () => SlotStore;
}

export interface DraftText {
  readonly save: () => void;
  readonly saveSoon: () => void;
  readonly load: () => Promise<void>;
  readonly restoreBootScroll: () => void;
  readonly dropBootScroll: () => void;
}

const CARET_KEY = "mn-spell:caret";
const MIGRATED_KEY = "mn-spell:slot-text";

async function migrateShared(store: SlotStore): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_KEY) !== null) return;
  } catch (_) {
    return;
  }
  const slot = store.shared();
  const text = await loadDraft().catch(() => null);
  if (text !== null && text.trim() !== "") store.write(slot, text);
  const ref = loadDraftFile();
  if (ref !== null) saveDraftFile(ref, slot);
  try {
    const [start, end, scroll] = (localStorage.getItem(CARET_KEY) ?? "")
      .split(",")
      .map(Number);
    if ([start, end, scroll].every((n) => Number.isFinite(n)))
      store.writeCaret(slot, { start: start!, end: end!, scroll: scroll! });
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch (_) {}
}

export function initDraftText(deps: DraftTextDeps): DraftText {
  const { editor } = deps;
  function caretNow(): { start: number; end: number; scroll: number } {
    return {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    };
  }

  function saveCaret(): void {
    const store = deps.store();
    store.writeCaret(store.slot(), caretNow());
  }

  function save(): void {
    const store = deps.store();
    store.write(store.slot(), editor.value);
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
      const store = deps.store();
      await migrateShared(store);
      const slot = store.slot();
      const draftText = await store.read(slot);
      if (draftText != null) {
        editor.value = draftText;
        deps.onLoaded();
      }
      const caret = store.caret(slot);
      if (caret != null) {
        const len = editor.value.length;
        const start = Math.min(Math.max(0, caret.start), len);
        const end = Math.min(Math.max(start, caret.end), len);
        try {
          editor.setSelectionRange(start, end);
        } catch (_) {}
        deps.onCaret({ start, end });
        if (caret.scroll > 0) bootScroll = caret.scroll;
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
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });

  return { save, saveSoon, load, restoreBootScroll, dropBootScroll };
}
