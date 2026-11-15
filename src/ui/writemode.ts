import { createEmitter } from "../core/emitter.ts";
import { KEYS, read, remove, write } from "../core/store.ts";

export interface WriteMode {
  on(): boolean;
  set(on: boolean): void;
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

function paint(on: boolean): void {
  const data = document.documentElement.dataset;
  if (on) data.write = "on";
  else delete data.write;
}

export function createWriteMode(): WriteMode {
  let on = read(KEYS.writeMode) === "on";
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

  return {
    on: () => on,
    set,
    onChange: changed.on,
    destroy() {
      document.removeEventListener("keydown", onKey);
      changed.clear();
    },
  };
}

function toolButton(label: string, title: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "write-tool";
  node.textContent = label;
  node.title = title;
  node.addEventListener("mousedown", (e) => e.preventDefault());
  return node;
}

export function writeTools(
  tools: HTMLElement,
  mode: WriteMode,
  define: HTMLButtonElement | null,
  shortcut: string,
): () => void {
  const nodes: HTMLButtonElement[] = [];
  if (define) {
    const word = toolButton("Тайлбар", define.title);
    word.addEventListener("click", () => define.click());
    nodes.push(word);
  }
  const exit = toolButton("Гарах", `Бичих горимоос гарах (${shortcut})`);
  exit.addEventListener("click", () => mode.set(false));
  nodes.push(exit);
  tools.prepend(...nodes);
  return () => {
    for (const node of nodes) node.remove();
  };
}
