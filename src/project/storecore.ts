import { createPersist } from "./projectpersist.ts";
import { ProjectError } from "./projecterror.ts";
import { newState, type ProjectKind, type State } from "./projectstate.ts";

export interface StoreCore {
  readonly persist: ReturnType<typeof createPersist>;
  state(): State | null;
  replace(next: State | null): void;
  fresh(
    kind: ProjectKind,
    name: string,
    handle: FileSystemDirectoryHandle | null,
    entries: Iterable<[string, Uint8Array]>,
    dirs: Iterable<string>,
  ): State;
  changed(structure: boolean): void;
  notify(): void;
  onChange(listener: () => void): () => void;
  onConflict(listener: (paths: string[]) => void): () => void;
  conflict(paths: string[]): void;
  require(): State;
  diskRoot(): FileSystemDirectoryHandle | null;
}

export function createStoreCore(): StoreCore {
  let current: State | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const conflictListeners = new Set<(paths: string[]) => void>();
  const persist = createPersist(() => current);
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    persist,
    state: () => current,
    replace(next) {
      current = next;
    },
    fresh: (kind, name, handle, entries, dirs) =>
      newState(nextId++, kind, name, handle, entries, dirs),
    changed(structure) {
      if (!current) return;
      current.version += 1;
      if (structure) void persist.save(current.kind !== "dir");
      else persist.saveSoon();
      notify();
    },
    notify,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onConflict(listener) {
      conflictListeners.add(listener);
      return () => conflictListeners.delete(listener);
    },
    conflict(paths) {
      for (const listener of conflictListeners) listener(paths);
    },
    require() {
      const s = current;
      if (!s || s.pending) throw new ProjectError("Төсөл нээгдээгүй байна");
      return s;
    },
    diskRoot() {
      const s = current;
      return s?.handle && s.kind === "dir" ? s.handle : null;
    },
  };
}
