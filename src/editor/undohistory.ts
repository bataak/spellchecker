import { openDatabase } from "../core/idb.ts";
import { swapOrigin } from "./editortext.ts";
import { minimalDiff } from "../mdbar/mdedit.ts";
import { noteError } from "../core/errorlog.ts";

export interface Step {
  from: number;
  removed: string;
  inserted: string;
  before: [number, number];
  after: [number, number];
  at: number;
}

export interface History {
  undo: Step[];
  redo: Step[];
}

export const MAX_STEPS = 10000;
export const MAX_CHARS = 1_000_000;
const GROUP_MS = 1000;

export function emptyHistory(): History {
  return { undo: [], redo: [] };
}

function size(step: Step): number {
  return step.removed.length + step.inserted.length;
}

function trim(steps: Step[]): void {
  if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
  let total = 0;
  for (const step of steps) total += size(step);
  while (total > MAX_CHARS && steps.length > 1) total -= size(steps.shift()!);
}

function mergeable(last: Step, step: Step): boolean {
  if (step.at - last.at > GROUP_MS) return false;
  if (/\n/.test(step.inserted) || /\n/.test(step.removed)) return false;
  if (!last.removed && !step.removed)
    return last.from + last.inserted.length === step.from;
  if (!last.inserted && !step.inserted)
    return step.from + step.removed.length === last.from;
  return false;
}

export function record(
  history: History,
  before: string,
  after: string,
  selBefore: [number, number],
  selAfter: [number, number],
  now: number,
): History {
  const patch = minimalDiff(before, after);
  if (!patch) return history;
  const step: Step = {
    from: patch.from,
    removed: before.slice(patch.from, patch.to),
    inserted: patch.insert,
    before: selBefore,
    after: selAfter,
    at: now,
  };
  const undo = history.undo.slice();
  const last = undo[undo.length - 1];
  if (last && mergeable(last, step)) {
    undo[undo.length - 1] = last.removed
      ? {
          ...last,
          from: step.from,
          removed: step.removed + last.removed,
          after: step.after,
          at: step.at,
        }
      : {
          ...last,
          inserted: last.inserted + step.inserted,
          after: step.after,
          at: step.at,
        };
  } else {
    undo.push(step);
  }
  trim(undo);
  return { undo, redo: [] };
}

export interface Applied {
  text: string;
  selection: [number, number];
  history: History;
}

export function undo(text: string, history: History): Applied | null {
  const step = history.undo[history.undo.length - 1];
  if (!step) return null;
  const end = step.from + step.inserted.length;
  if (text.slice(step.from, end) !== step.inserted) return null;
  return {
    text: text.slice(0, step.from) + step.removed + text.slice(end),
    selection: step.before,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, step],
    },
  };
}

export function redo(text: string, history: History): Applied | null {
  const step = history.redo[history.redo.length - 1];
  if (!step) return null;
  const end = step.from + step.removed.length;
  if (text.slice(step.from, end) !== step.removed) return null;
  return {
    text: text.slice(0, step.from) + step.inserted + text.slice(end),
    selection: step.after,
    history: {
      undo: [...history.undo, step],
      redo: history.redo.slice(0, -1),
    },
  };
}

export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + text.length.toString(36);
}

interface Stored {
  slot: string;
  history: History;
  sum: string;
  savedAt: number;
}

const DB_NAME = "bichig-undo";
const STORE = "history";

function openDb(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, (db) =>
    db.createObjectStore(STORE, { keyPath: "slot" }),
  );
}

function done(request: IDBRequest): Promise<void> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function loadStored(slot: string): Promise<Stored | null> {
  try {
    const db = await openDb();
    const request = db.transaction(STORE).objectStore(STORE).get(slot);
    await done(request);
    return (request.result as Stored | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function storedHistoryTexts(): Promise<string[]> {
  try {
    const db = await openDb();
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    await done(request);
    const out: string[] = [];
    for (const entry of (request.result as Stored[] | undefined) ?? [])
      for (const step of [...entry.history.undo, ...entry.history.redo])
        out.push(step.removed, step.inserted);
    return out;
  } catch {
    return [];
  }
}

async function saveStored(entry: Stored): Promise<void> {
  try {
    const db = await openDb();
    await done(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(entry),
    );
  } catch (error) {
    noteError(error);
  }
}

export interface UndoDeps {
  readonly editor: HTMLTextAreaElement;
  readonly slot: () => string;
}

export interface UndoControl {
  readonly baseline: () => void;
  readonly reset: () => void;
}

const SAVE_DELAY_MS = 1000;

export function initUndoHistory(deps: UndoDeps): UndoControl {
  const { editor } = deps;
  let history = emptyHistory();
  let slot = deps.slot();
  let value = editor.value;
  let selection: [number, number] = [
    editor.selectionStart,
    editor.selectionEnd,
  ];
  const memory = new Map<string, Stored>();
  const saveTimers = new Map<string, number>();
  let loadSeq = 0;

  const persist = (): void => {
    const entry: Stored = {
      slot,
      history,
      sum: checksum(value),
      savedAt: Date.now(),
    };
    memory.set(slot, entry);
    clearTimeout(saveTimers.get(slot));
    saveTimers.set(
      slot,
      window.setTimeout(() => {
        saveTimers.delete(entry.slot);
        void saveStored(entry);
      }, SAVE_DELAY_MS),
    );
  };

  const adopt = (
    stored: Stored | null | undefined,
    expected: string,
  ): boolean => {
    if (!stored || stored.sum !== expected) return false;
    history = stored.history;
    return true;
  };

  const baseline = (): void => {
    slot = deps.slot();
    value = editor.value;
    selection = [editor.selectionStart, editor.selectionEnd];
    history = emptyHistory();
    const seq = ++loadSeq;
    const expected = checksum(value);
    if (memory.has(slot)) {
      adopt(memory.get(slot), expected);
      return;
    }
    void loadStored(slot).then((stored) => {
      if (seq !== loadSeq) return;
      if (history.undo.length || history.redo.length) return;
      adopt(stored, expected);
    });
  };

  const trackSelection = (): void => {
    if (document.activeElement === editor)
      selection = [editor.selectionStart, editor.selectionEnd];
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

  editor.addEventListener("beforeinput", (event) => {
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      apply(undo(editor.value, history));
    } else if (event.inputType === "historyRedo") {
      event.preventDefault();
      apply(redo(editor.value, history));
    } else {
      trackSelection();
    }
  });

  editor.addEventListener(
    "keydown",
    (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      const code = event.code;
      const isZ = key === "z" || code === "KeyZ";
      const isY = key === "y" || code === "KeyY";
      if (isZ && !event.shiftKey) {
        event.preventDefault();
        apply(undo(editor.value, history));
      } else if ((isZ && event.shiftKey) || (isY && !event.shiftKey)) {
        event.preventDefault();
        apply(redo(editor.value, history));
      }
    },
    true,
  );

  editor.addEventListener("input", (event) => {
    const input = event as InputEvent;
    if (input.inputType === "historyUndo") return;
    if (swapOrigin(input) !== null) {
      baseline();
      return;
    }
    if (input.isComposing) return;
    const next = editor.value;
    const after: [number, number] = [
      editor.selectionStart,
      editor.selectionEnd,
    ];
    history = record(history, value, next, selection, after, Date.now());
    value = next;
    selection = after;
    persist();
  });

  editor.addEventListener("compositionend", () => {
    const next = editor.value;
    const after: [number, number] = [
      editor.selectionStart,
      editor.selectionEnd,
    ];
    history = record(history, value, next, selection, after, Date.now());
    value = next;
    selection = after;
    persist();
  });

  const reset = (): void => {
    loadSeq++;
    slot = deps.slot();
    value = editor.value;
    selection = [editor.selectionStart, editor.selectionEnd];
    history = emptyHistory();
    persist();
  };

  document.addEventListener("selectionchange", trackSelection);
  baseline();
  return { baseline, reset };
}
