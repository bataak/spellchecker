import { createEmitter } from "../core/emitter.ts";
import { KEYS, read, remove, write } from "../core/store.ts";

export type WriteKind = "pdf" | "text";

export interface WriteMode {
  on(): boolean;
  set(on: boolean): void;
  kind(): WriteKind;
  setKind(kind: WriteKind): void;
  onChange(listener: (on: boolean) => void): () => void;
  destroy(): void;
}

export function isWriteKey(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
  code: string;
}): boolean {
  return (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    !e.altKey &&
    (e.code === "KeyF" || e.key.toLowerCase() === "f")
  );
}

export function writing(): boolean {
  return document.documentElement.dataset.write === "on";
}

function paint(on: boolean): void {
  const data = document.documentElement.dataset;
  if (on) data.write = "on";
  else delete data.write;
}

export function createWriteMode(): WriteMode {
  let on = read(KEYS.writeMode) === "on";
  let kind: WriteKind = read(KEYS.writeKind) === "text" ? "text" : "pdf";
  const changed = createEmitter<boolean>();
  paint(on);

  const set = (next: boolean): void => {
    if (next === on) return;
    on = next;
    if (on) write(KEYS.writeMode, "on");
    else remove(KEYS.writeMode);
    paint(on);
    changed.emit(on);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.isComposing || !isWriteKey(e)) return;
    e.preventDefault();
    set(!on);
  };
  document.addEventListener("keydown", onKey);

  const setKind = (next: WriteKind): void => {
    if (next === kind) return;
    kind = next;
    if (kind === "text") write(KEYS.writeKind, kind);
    else remove(KEYS.writeKind);
    if (on) changed.emit(on);
  };

  return {
    on: () => on,
    set,
    kind: () => kind,
    setKind,
    onChange: changed.on,
    destroy() {
      document.removeEventListener("keydown", onKey);
      changed.clear();
    },
  };
}

export function writeTools(
  tools: HTMLElement,
  mode: WriteMode,
  shortcut: string,
): () => void {
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "write-tool";
  exit.textContent = "Гарах";
  exit.title = `Бичих горимоос гарах (${shortcut})`;
  exit.addEventListener("mousedown", (e) => e.preventDefault());
  exit.addEventListener("click", () => mode.set(false));
  tools.prepend(exit);
  return () => exit.remove();
}
