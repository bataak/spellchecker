import { remoteChanges, swapOrigin } from "./editortext.ts";
import {
  emptyHistory,
  type Applied,
  undo,
  redo,
  record,
  rebaseHistory,
} from "./undomodel.ts";
import {
  type Stored,
  saveStored,
  dropStored,
  checksum,
  loadStored,
} from "./undostore.ts";

export interface UndoDeps {
  readonly editor: HTMLTextAreaElement;
  readonly slot: () => string;
}

export interface UndoControl {
  readonly baseline: () => void;
  readonly reset: () => void;
  readonly forget: (slot: string) => Promise<void>;
}

const SAVE_DELAY_MS = 1000;

function selectionOf(editor: HTMLTextAreaElement): [number, number] {
  return [editor.selectionStart, editor.selectionEnd];
}

function historyKey(event: KeyboardEvent): "undo" | "redo" | null {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.altKey || event.isComposing) return null;
  const key = event.key.toLowerCase();
  const isZ = key === "z" || event.code === "KeyZ";
  const isY = key === "y" || event.code === "KeyY";
  if (isZ && !event.shiftKey) return "undo";
  if ((isZ && event.shiftKey) || (isY && !event.shiftKey)) return "redo";
  return null;
}

function historyInput(event: InputEvent): "undo" | "redo" | null {
  if (event.inputType === "historyUndo") return "undo";
  if (event.inputType === "historyRedo") return "redo";
  return null;
}

function createSaver() {
  const memory = new Map<string, Stored>();
  const timers = new Map<string, number>();
  return {
    memory,
    save(entry: Stored): void {
      memory.set(entry.slot, entry);
      clearTimeout(timers.get(entry.slot));
      timers.set(
        entry.slot,
        window.setTimeout(() => {
          timers.delete(entry.slot);
          void saveStored(entry);
        }, SAVE_DELAY_MS),
      );
    },
    forget(slot: string): Promise<void> {
      clearTimeout(timers.get(slot));
      timers.delete(slot);
      memory.delete(slot);
      return dropStored(slot);
    },
  };
}

function bindHistoryKeys(
  editor: HTMLTextAreaElement,
  step: (kind: "undo" | "redo") => void,
  trackSelection: () => void,
): void {
  editor.addEventListener("beforeinput", (event) => {
    const kind = historyInput(event);
    if (!kind) return trackSelection();
    event.preventDefault();
    step(kind);
  });

  editor.addEventListener(
    "keydown",
    (event) => {
      const kind = historyKey(event);
      if (!kind) return;
      event.preventDefault();
      step(kind);
    },
    true,
  );
}

export function initUndoHistory(deps: UndoDeps): UndoControl {
  const { editor } = deps;
  let history = emptyHistory();
  let slot = deps.slot();
  let value = editor.value;
  let selection = selectionOf(editor);
  const saver = createSaver();
  let loadSeq = 0;

  const persist = (): void => {
    const sum = checksum(value);
    saver.save({ slot, history, sum, savedAt: Date.now() });
  };

  const adopt = (
    stored: Stored | null | undefined,
    expected: string,
  ): boolean => {
    if (!stored || stored.sum !== expected) return false;
    history = stored.history;
    return true;
  };

  const restart = (): void => {
    slot = deps.slot();
    value = editor.value;
    selection = selectionOf(editor);
    history = emptyHistory();
  };

  const baseline = (): void => {
    restart();
    const seq = ++loadSeq;
    const expected = checksum(value);
    if (saver.memory.has(slot)) {
      adopt(saver.memory.get(slot), expected);
      return;
    }
    void loadStored(slot).then((stored) => {
      if (seq !== loadSeq) return;
      if (history.undo.length || history.redo.length) return;
      adopt(stored, expected);
    });
  };

  const trackSelection = (): void => {
    if (document.activeElement === editor) selection = selectionOf(editor);
  };

  const apply = (result: Applied | null): void => {
    if (!result) return;
    history = result.history;
    editor.value = result.text;
    value = result.text;
    editor.setSelectionRange(result.selection[0], result.selection[1]);
    selection = result.selection;
    editor.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "historyUndo" }),
    );
    persist();
  };

  const step = (kind: "undo" | "redo"): void => {
    if (editor.readOnly) return;
    apply((kind === "undo" ? undo : redo)(editor.value, history));
  };

  const recordEdit = (): void => {
    const next = editor.value;
    const after = selectionOf(editor);
    history = record(history, value, next, selection, after, Date.now());
    value = next;
    selection = after;
    persist();
  };

  bindHistoryKeys(editor, step, trackSelection);

  editor.addEventListener("input", (event) => {
    const input = event as InputEvent;
    if (input.inputType === "historyUndo") return;
    const remote = remoteChanges(input);
    if (remote) {
      history = rebaseHistory(history, remote);
      value = editor.value;
      selection = selectionOf(editor);
      persist();
      return;
    }
    if (swapOrigin(input) !== null) {
      baseline();
      return;
    }
    if (!input.isComposing) recordEdit();
  });

  editor.addEventListener("compositionend", recordEdit);

  const reset = (): void => {
    loadSeq++;
    restart();
    persist();
  };

  document.addEventListener("selectionchange", trackSelection);
  baseline();
  return { baseline, reset, forget: saver.forget };
}
