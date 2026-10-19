import {
  baseName,
  cleanPath,
  dirName,
  isEditablePath,
  isLatexDocument,
  isTexSource,
  joinPath,
  sameOnDisk,
  within,
} from "../tex/texproject.ts";
import { buildProject, type ProjectBuild } from "./projectbuild.ts";
import {
  dirHandleFor,
  moveEntry,
  readDir,
  removeEntry,
  writeEntry,
} from "./projectdisk.ts";
import {
  applyEdits,
  applyScan,
  dropEntries,
  markZipped,
  moveEntries,
  putDir,
  putFile,
  snapshotOf,
  type ProjectSnapshot,
} from "./projectedit.ts";
import { ProjectError } from "./projecterror.ts";
import {
  createPersist,
  storedEdits,
  storedFiles,
  storedMeta,
} from "./projectpersist.ts";
import {
  digestOf,
  download,
  downloadChanged,
  writeChanged,
  zipOf,
} from "./projectsave.ts";
import {
  pickDirectoryFiles,
  readFileList,
  readZip,
  type LoadedFiles,
} from "./projectsources.ts";
import {
  diskText,
  exists,
  markDirty,
  metaOf,
  newState,
  newUid,
  withStamps,
  type Meta,
  type ProjectKind,
  type State,
} from "./projectstate.ts";
import { attemptAsync } from "../attempt.ts";

export interface ProjectView {
  readonly id: number;
  readonly kind: ProjectKind;
  readonly name: string;
  readonly label: string;
  readonly files: readonly string[];
  readonly dirs: readonly string[];
  readonly main: string | null;
  readonly active: string | null;
  readonly dirty: ReadonlySet<string>;
  readonly unsaved: boolean;
  readonly pending: boolean;
  readonly version: number;
  readonly exportedAt: number | null;
  readonly uid: string;
}

export { ProjectError } from "./projecterror.ts";
export type { ProjectBuild } from "./projectbuild.ts";
export type { ProjectSnapshot } from "./projectedit.ts";
export type { ProjectKind } from "./projectstate.ts";

export type SaveResult = "saved" | "downloaded" | "files" | "clean";

export function createProjectStore() {
  let state: State | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const persist = createPersist(() => state);

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function onProjectChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function project(): ProjectView | null {
    const s = state;
    if (!s) return null;
    const dirty = new Set(s.dirty);
    return {
      id: s.id,
      kind: s.kind,
      name: s.name,
      label: s.twin && s.main ? s.name + " · " + baseName(s.main) : s.name,
      files: [...s.texts.keys(), ...s.binaries.keys()],
      dirs: [...s.dirs],
      main: s.main,
      active: s.active,
      dirty,
      unsaved:
        dirty.size > 0 ||
        s.fresh.size > 0 ||
        (s.kind === "memory" && s.unsynced),
      pending: s.pending,
      version: s.version,
      exportedAt: s.exportedAt,
      uid: s.uid,
    };
  }

  function hasProject(): boolean {
    return state !== null && !state.pending;
  }

  function projectBinary(path: string): Uint8Array | null {
    return state?.binaries.get(path) ?? null;
  }

  function projectText(path: string): string | null {
    return state?.texts.get(path) ?? null;
  }

  function projectSavedText(path: string): string | null {
    return state?.saved.get(path) ?? null;
  }

  function projectKey(): string | null {
    return state && !state.pending ? String(state.version) : null;
  }

  let digestMemo: { id: number; version: number; value: string } | null = null;

  async function projectDigest(): Promise<string | null> {
    const s = state;
    if (!s || s.pending || !s.main) return null;
    if (digestMemo?.id === s.id && digestMemo.version === s.version)
      return digestMemo.value;
    const { id, version } = s;
    const value = await digestOf(s);
    if (value !== null) digestMemo = { id, version, value };
    return value;
  }

  function changed(structure: boolean): void {
    if (!state) return;
    state.version += 1;
    if (structure) void persist.save(state.kind !== "dir");
    else persist.saveSoon();
    notify();
  }

  function fromEntries(
    kind: ProjectKind,
    name: string,
    handle: FileSystemDirectoryHandle | null,
    entries: Iterable<[string, Uint8Array]>,
    dirs: Iterable<string>,
  ): State {
    return newState(nextId++, kind, name, handle, entries, dirs);
  }

  function fromLoaded(kind: ProjectKind, loaded: LoadedFiles): State {
    return fromEntries(kind, loaded.name, null, loaded.files, loaded.dirs);
  }

  let refreshing: Promise<boolean> | null = null;

  function refreshProject(): Promise<boolean> {
    refreshing ??= refreshFromDisk().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function refreshFromDisk(): Promise<boolean> {
    const s = state;
    if (!s || s.pending || s.kind !== "dir" || !s.handle) return false;
    try {
      if (
        (await s.handle.queryPermission?.({ mode: "readwrite" })) !== "granted"
      )
        return false;
    } catch {
      return false;
    }
    const scan = await readDir(s.handle, s.stamps);
    if (state !== s) return false;
    if (!applyScan(s, scan)) return false;
    changed(true);
    return true;
  }

  function adopt(next: State): void {
    if (next.main === null)
      throw new ProjectError(
        "Төсөлд \\documentclass болон \\begin{document} бүхий үндсэн .tex файл олдсонгүй",
      );
    next.active = next.main ?? [...next.texts.keys()].find(isTexSource) ?? null;
    next.twin =
      state !== null &&
      state.name === next.name &&
      state.main !== null &&
      next.main !== null &&
      baseName(state.main) !== baseName(next.main);
    state = next;
    void persist
      .save(true)
      .then(() => (next.kind === "dir" ? persist.dropFiles() : undefined));
    notify();
  }

  async function openDirHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    const writable = await attemptAsync(
      async () =>
        (await handle.requestPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    const { files, dirs, stamps } = await readDir(handle);
    adopt(
      withStamps(
        fromEntries(
          writable ? "dir" : "folder",
          handle.name,
          writable ? handle : null,
          files,
          dirs,
        ),
        stamps,
      ),
    );
  }

  async function pickFolder(
    near: FileSystemFileHandle | null = null,
  ): Promise<boolean> {
    if (window.showDirectoryPicker) {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await window.showDirectoryPicker({
          mode: "readwrite",
          ...(near ? { startIn: near } : {}),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return false;
        throw error;
      }
      await openDirHandle(handle);
      return true;
    }
    const picked = await pickDirectoryFiles();
    if (!picked.length) return false;
    adopt(fromLoaded("folder", await readFileList(picked)));
    return true;
  }

  async function openZip(file: File): Promise<void> {
    adopt(fromLoaded("memory", await readZip(file)));
  }

  let pendingEdits: Record<string, string> = {};

  function applyRestored(
    next: State,
    meta: Meta,
    edits: Record<string, string>,
  ): void {
    applyEdits(next, meta, edits);
    state = next;
    notify();
  }

  async function restoreProject(): Promise<boolean> {
    const meta = await storedMeta();
    if (!meta) return false;
    const edits = await storedEdits();
    if (meta.kind !== "dir") {
      const files = await storedFiles();
      if (!files) return false;
      const next = fromEntries(
        meta.kind,
        meta.name,
        null,
        Object.entries(files),
        meta.dirs,
      );
      applyRestored(next, meta, edits);
      return true;
    }
    if (!meta.handle) return false;
    const handle = meta.handle;
    const granted = await attemptAsync(
      async () =>
        (await handle.queryPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    if (granted) {
      const { files, dirs, stamps } = await readDir(meta.handle);
      applyRestored(
        withStamps(
          fromEntries("dir", meta.name, meta.handle, files, dirs),
          stamps,
        ),
        meta,
        edits,
      );
      return true;
    }
    state = {
      ...fromEntries("dir", meta.name, meta.handle, [], meta.dirs),
      pending: true,
      exportedAt: meta.exportedAt ?? null,
      main: meta.main,
      active: meta.active,
      twin: meta.twin ?? false,
      uid: meta.uid ?? newUid(),
    };
    pendingEdits = edits;
    notify();
    return true;
  }

  async function grantProject(): Promise<boolean> {
    const s = state;
    if (!s?.pending || !s.handle) return false;
    const handle = s.handle;
    const granted = await attemptAsync(
      async () =>
        (await handle.requestPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    if (!granted) return false;
    const { files, dirs, stamps } = await readDir(s.handle);
    const meta = metaOf(s);
    applyRestored(
      withStamps(fromEntries("dir", s.name, s.handle, files, dirs), stamps),
      meta,
      pendingEdits,
    );
    pendingEdits = {};
    return true;
  }

  function closeProject(): void {
    state = null;
    pendingEdits = {};
    persist.clear();
    notify();
  }

  function setProjectText(path: string, text: string): void {
    const s = state;
    if (!s || s.pending || !s.texts.has(path) || s.texts.get(path) === text)
      return;
    s.texts.set(path, text);
    markDirty(s, path);
    changed(false);
  }

  function setActive(path: string | null): void {
    const s = state;
    if (!s || s.active === path) return;
    s.active = path;
    void persist.save();
    notify();
  }

  function setMain(path: string): void {
    const s = state;
    const text = s?.texts.get(path);
    if (!s || !isTexSource(path) || text === undefined || s.main === path)
      return;
    if (!isLatexDocument(text)) return;
    s.main = path;
    changed(true);
  }

  function diskRoot(): FileSystemDirectoryHandle | null {
    const s = state;
    return s?.handle && s.kind === "dir" ? s.handle : null;
  }

  function requireState(): State {
    const s = state;
    if (!s || s.pending) throw new ProjectError("Төсөл нээгдээгүй байна");
    return s;
  }

  async function storeFile(
    s: State,
    path: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const root = diskRoot();
    if (root) await writeEntry(root, path, bytes);
    putFile(s, path, bytes);
    changed(true);
  }

  async function createFile(path: string): Promise<void> {
    const s = requireState();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Файлын нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError("Ийм нэртэй зүйл байна");
    await storeFile(s, clean, new Uint8Array(0));
  }

  function projectHas(path: string): boolean {
    const s = state;
    const clean = cleanPath(path);
    return !!s && !!clean && exists(s, clean);
  }

  async function addFile(path: string, bytes: Uint8Array): Promise<void> {
    const s = requireState();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Файлын нэр буруу байна");
    if (
      s.dirs.has(clean) ||
      (exists(s, clean) && !s.texts.has(clean) && !s.binaries.has(clean))
    )
      throw new ProjectError("Ийм нэртэй зүйл байна");
    await storeFile(s, clean, bytes);
  }

  async function createDir(path: string): Promise<void> {
    const s = requireState();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Хавтасны нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError("Ийм нэртэй зүйл байна");
    if (s.kind === "dir" && s.handle) await dirHandleFor(s.handle, clean, true);
    putDir(s, clean);
    changed(true);
  }

  async function moveOnDisk(
    s: State,
    root: FileSystemDirectoryHandle,
    from: string,
    target: string,
  ): Promise<void> {
    const files: [string, Uint8Array | string][] = [
      ...[...s.saved].map(([path, text]): [string, string] => [
        path,
        diskText(s, path, text),
      ]),
      ...s.binaries,
    ];
    const dir = s.dirs.has(from);
    if (!sameOnDisk(from, target)) {
      await moveEntry(root, { from, source: from, target, dir }, files);
      return;
    }
    const temp = joinPath(
      dirName(from),
      "." + baseName(from) + "-" + Date.now().toString(36),
    );
    await moveEntry(root, { from, source: from, target: temp, dir }, files);
    await moveEntry(root, { from, source: temp, target, dir }, files);
  }

  async function renamePath(from: string, to: string): Promise<void> {
    const s = requireState();
    const target = cleanPath(to);
    if (!target) throw new ProjectError("Нэр буруу байна");
    if (target === from) return;
    if (exists(s, target, from))
      throw new ProjectError("Ийм нэртэй зүйл байна");
    if (within(target, from))
      throw new ProjectError("Хавтсыг өөр дотор нь зөөх боломжгүй");
    if (s.dirty.has(from) && !isEditablePath(target))
      throw new ProjectError(
        "Хадгалаагүй өөрчлөлттэй файлыг засах боломжгүй төрөл рүү нэрлэхгүй",
      );
    const root = diskRoot();
    if (root) await moveOnDisk(s, root, from, target);
    moveEntries(s, from, target);
    changed(true);
  }

  async function removePath(path: string): Promise<void> {
    const s = requireState();
    const root = diskRoot();
    if (root) await removeEntry(root, path);
    dropEntries(s, path);
    changed(true);
  }

  async function projectZip(): Promise<Blob> {
    return zipOf(requireState());
  }

  async function saveProject(): Promise<SaveResult> {
    const s = requireState();
    if (s.kind === "dir") {
      if (!(await writeChanged(s, diskRoot()))) return "clean";
      changed(true);
      return "saved";
    }
    if (s.kind === "folder") {
      if (!(await downloadChanged(s))) return "clean";
      changed(true);
      return "files";
    }
    await exportZip();
    return "downloaded";
  }

  async function exportZip(): Promise<void> {
    const snap = projectSnapshot();
    download(await projectZip(), requireState().name + ".zip");
    markExported(snap);
  }

  function projectSnapshot(): ProjectSnapshot {
    return snapshotOf(requireState());
  }

  function markExported(snap: ProjectSnapshot = projectSnapshot()): void {
    const s = state;
    if (!s || s.id !== snap.id) return;
    s.exportedAt = Date.now();
    if (s.kind === "memory") markZipped(s, snap);
    changed(true);
  }

  function projectBuild(): Promise<ProjectBuild> {
    return buildProject(requireState());
  }

  return {
    onProjectChange,
    project,
    hasProject,
    projectBinary,
    projectText,
    projectSavedText,
    projectKey,
    projectDigest,
    refreshProject,
    openDirHandle,
    pickFolder,
    openZip,
    restoreProject,
    grantProject,
    closeProject,
    setProjectText,
    setActive,
    setMain,
    createFile,
    projectHas,
    addFile,
    createDir,
    renamePath,
    removePath,
    projectZip,
    saveProject,
    exportZip,
    projectSnapshot,
    markExported,
    projectBuild,
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
