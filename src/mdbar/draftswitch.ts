import { swapText } from "../editor/editortext.ts";
import { findTemplate } from "../doc/templates.ts";
import {
  LARGE_DRAFT,
  chosenExample,
  draftError,
  loadCaret,
  loadDraft,
  readDraft,
  saveCaret,
  saveDraft,
} from "../slots/slotstore.ts";

export interface DraftSwitchDeps {
  readonly editor: HTMLTextAreaElement;
  readonly currentKey: () => string;
  readonly onExample?: () => void;
}

export interface DraftSwitch {
  loadingKey(): string | null;
  leave(from: string, extra: readonly (string | null)[]): void;
  enter(id: string, key: string): void;
}

export function createDraftSwitch(d: DraftSwitchDeps): DraftSwitch {
  const { editor } = d;
  let switchSeq = 0;
  let loadingKey: string | null = null;

  const resetText = (text: string, start: number, end: number): void =>
    swapText(editor, text, { origin: "slot", start, end });

  async function loadDefault(key: string, example: string): Promise<void> {
    const { exampleText } = await import("../doc/examples.ts");
    const text = exampleText(example);
    if (text === undefined || d.currentKey() !== key || editor.value.trim())
      return;
    resetText(text, 0, 0);
    editor.scrollTop = 0;
    d.onExample?.();
  }

  function showDraft(id: string, key: string, stored: string | null): void {
    const text = stored ?? findTemplate(id)?.skeleton ?? "";
    const caret = stored === null ? null : loadCaret(key);
    const start = Math.min(caret?.start ?? text.length, text.length);
    const end = Math.min(caret?.end ?? text.length, text.length);
    resetText(text, start, end);
    if (caret !== null) {
      editor.scrollTop = caret.scroll;
      requestAnimationFrame(() => {
        if (d.currentKey() === key) editor.scrollTop = caret.scroll;
      });
    }
    const first = chosenExample(id);
    if (stored === null && first) void loadDefault(key, first);
  }

  return {
    loadingKey: () => loadingKey,
    leave(from, extra) {
      const parts = [editor.value, ...extra].filter(
        (part): part is string => part !== null && part.trim() !== "",
      );
      if (from !== loadingKey) saveDraft(from, parts.join("\n\n"));
      saveCaret(from, {
        start: editor.selectionStart,
        end: editor.selectionEnd,
        scroll: editor.scrollTop,
      });
    },
    enter(id, key) {
      const seq = ++switchSeq;
      if (loadDraft(key) !== LARGE_DRAFT) {
        loadingKey = null;
        showDraft(id, key, loadDraft(key));
        return;
      }
      loadingKey = key;
      void readDraft(key).then((stored) => {
        if (seq !== switchSeq) return;
        if (stored === null) draftError();
        else loadingKey = null;
        showDraft(id, key, stored);
      });
    },
  };
}
