import { decodeFileBytes } from "../archive/cp1251.ts";
import {
  baseName,
  cleanPath,
  commonRoot,
  dirName,
  findMain,
  isEditablePath,
  isLatexDocument,
  isTexSource,
  joinPath,
  movedPath,
  parentDirs,
  rootedPath,
  sameOnDisk,
  skippedPath,
  within,
} from "../tex/texproject.ts";
import { unpackedSize } from "../archive/archive.ts";
import { buildProject, type ProjectBuild } from "./projectbuild.ts";
import { dbGet, dbPut } from "./projectdb.ts";
import {
  MAX_BYTES,
  budget,
  copyDir,
  dirHandleFor,
  readDir,
  readEntry,
  removeEntry,
  writeEntry,
} from "./projectdisk.ts";
import { ProjectError } from "./projecterror.ts";

const META_KEY = "meta";
const FILES_KEY = "files";
const EDITS_KEY = "edits";
const EDITS_DELAY_MS = 800;

export type ProjectKind = "dir" | "folder" | "memory";

interface Meta {
  readonly kind: ProjectKind;
  readonly name: string;
  readonly handle: FileSystemDirectoryHandle | null;
  readonly main: string | null;
  readonly active: string | null;
  readonly dirs: readonly string[];
  readonly exportedAt?: number | null;
  readonly twin?: boolean;
  readonly uid?: string;
}

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

interface State {
  id: number;
  kind: ProjectKind;
  name: string;
  handle: FileSystemDirectoryHandle | null;
  pending: boolean;
  binaries: Map<string, Uint8Array>;
  texts: Map<string, string>;
  saved: Map<string, string>;
  added: Set<string>;
  fresh: Set<string>;
  dirty: Set<string>;
  dirs: Set<string>;
  main: string | null;
  active: string | null;
  unsynced: boolean;
  version: number;
  exportedAt: number | null;
  stamps: Map<string, string>;
  crlf: Set<string>;
  twin: boolean;
  uid: string;
  persisted: Record<string, string>;
}

export type SaveResult = "saved" | "downloaded" | "files" | "clean";

export interface ProjectSnapshot {
  readonly id: number;
  readonly texts: ReadonlyMap<string, string>;
  readonly added: ReadonlySet<string>;
}

function markDirty(s: State, path: string): void {
  if (s.added.has(path) || s.saved.get(path) !== s.texts.get(path))
    s.dirty.add(path);
  else s.dirty.delete(path);
}

function recountDirty(s: State): void {
  s.dirty = new Set(s.added);
  for (const path of s.texts.keys()) markDirty(s, path);
}

function dirtySet(s: State): ReadonlySet<string> {
  return s.dirty;
}

function metaOf(s: State): Meta {
  return {
    kind: s.kind,
    name: s.name,
    handle: s.handle,
    main: s.main,
    active: s.active,
    dirs: [...s.dirs],
    exportedAt: s.exportedAt,
    twin: s.twin,
    uid: s.uid,
  };
}

function editsOf(s: State): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of dirtySet(s)) out[path] = s.texts.get(path) ?? "";
  return out;
}

function readText(bytes: Uint8Array): { text: string; crlf: boolean } {
  const raw = decodeFileBytes(bytes);
  return { text: raw.replace(/\r\n?/g, "\n"), crlf: raw.includes("\r\n") };
}

function diskText(s: State, path: string, text: string): string {
  return s.crlf.has(path) ? text.replace(/\n/g, "\r\n") : text;
}

function noteEol(s: State, path: string, crlf: boolean): void {
  if (crlf) s.crlf.add(path);
  else s.crlf.delete(path);
}

function savedFilesOf(s: State): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();
  for (const [path, text] of s.saved)
    if (!s.added.has(path)) out[path] = encoder.encode(diskText(s, path, text));
  for (const [path, bytes] of s.binaries) out[path] = bytes;
  return out;
}

function newUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function mergedEdits(s: State): Promise<Record<string, string>> {
  const mine = editsOf(s);
  const stored = await dbGet<Meta>(META_KEY);
  if (stored?.uid !== s.uid) {
    s.persisted = mine;
    return mine;
  }
  const out = { ...((await dbGet<Record<string, string>>(EDITS_KEY)) ?? {}) };
  for (const path of new Set([
    ...Object.keys(mine),
    ...Object.keys(s.persisted),
  ])) {
    if (mine[path] === s.persisted[path]) continue;
    if (path in mine) out[path] = mine[path]!;
    else delete out[path];
  }
  s.persisted = mine;
  return out;
}

function withStamps(next: State, stamps: Map<string, string>): State {
  next.stamps = stamps;
  return next;
}

function pickDirectoryFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function exists(s: State, path: string, moving?: string): boolean {
  if (s.texts.has(path) || s.binaries.has(path) || s.dirs.has(path))
    return true;
  if (s.kind !== "dir") return false;
  return [...s.texts.keys(), ...s.binaries.keys(), ...s.dirs].some(
    (key) =>
      sameOnDisk(key, path) && (moving === undefined || !within(key, moving)),
  );
}

function movedKeys<T>(map: Map<string, T>, from: string, to: string): void {
  for (const [path, value] of [...map]) {
    const next = movedPath(path, from, to);
    if (next === null) continue;
    map.delete(path);
    map.set(next, value);
  }
}

function retype(s: State, path: string): void {
  const bytes = s.binaries.get(path);
  if (bytes && isEditablePath(path)) {
    const { text, crlf } = readText(bytes);
    s.binaries.delete(path);
    noteEol(s, path, crlf);
    s.texts.set(path, text);
    s.saved.set(path, text);
    return;
  }
  const text = s.saved.get(path);
  if (text === undefined || isEditablePath(path)) return;
  s.binaries.set(path, new TextEncoder().encode(diskText(s, path, text)));
  s.texts.delete(path);
  s.saved.delete(path);
  s.crlf.delete(path);
  s.added.delete(path);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createProjectStore() {
  let state: State | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();
  let editsTimer = 0;

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
    const dirty = new Set(dirtySet(s));
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

  let linked = false;

  function hasProject(): boolean {
    return state !== null && !state.pending;
  }

  function setLinked(on: boolean): void {
    linked = on;
  }

  function projectLinked(): boolean {
    return linked && hasProject();
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
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [encoder.encode(s.main + "\u0000")];
    const paths = [...s.texts.keys(), ...s.binaries.keys()].sort();
    for (const path of paths) {
      const text = s.texts.get(path);
      const data =
        text === undefined ? s.binaries.get(path)! : encoder.encode(text);
      parts.push(
        encoder.encode(path + "\u0000" + data.length + "\u0000"),
        data,
      );
    }
    try {
      const bytes = await new Blob(parts as BlobPart[]).arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const value = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      digestMemo = { id, version, value };
      return value;
    } catch {
      return null;
    }
  }

  let writing: Promise<void> = Promise.resolve();

  function writeState(withFiles: boolean): Promise<void> {
    const run = async (): Promise<void> => {
      const s = state;
      if (!s) return;
      const edits = await mergedEdits(s);
      if (state !== s) return;
      const entries: Record<string, unknown> = {
        [META_KEY]: metaOf(s),
        [EDITS_KEY]: edits,
      };
      if (withFiles && s.kind !== "dir") entries[FILES_KEY] = savedFilesOf(s);
      await dbPut(entries);
    };
    writing = writing.then(run, run);
    return writing;
  }

  function persistMeta(withFiles = false): Promise<void> {
    return writeState(withFiles);
  }

  function persistEdits(): void {
    if (editsTimer) clearTimeout(editsTimer);
    editsTimer = window.setTimeout(() => {
      editsTimer = 0;
      void writeState(false);
    }, EDITS_DELAY_MS);
  }

  function flushEdits(): void {
    if (!editsTimer) return;
    clearTimeout(editsTimer);
    editsTimer = 0;
    void writeState(false);
  }

  if (typeof window !== "undefined" && "addEventListener" in window) {
    window.addEventListener("pagehide", flushEdits);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushEdits();
    });
  }

  function changed(structure: boolean): void {
    if (!state) return;
    state.version += 1;
    if (structure) void persistMeta(state.kind !== "dir");
    else persistEdits();
    notify();
  }

  function fromEntries(
    kind: ProjectKind,
    name: string,
    handle: FileSystemDirectoryHandle | null,
    entries: Iterable<[string, Uint8Array]>,
    dirs: Iterable<string>,
  ): State {
    const texts = new Map<string, string>();
    const binaries = new Map<string, Uint8Array>();
    const crlf = new Set<string>();
    for (const [path, bytes] of entries) {
      if (!isEditablePath(path)) {
        binaries.set(path, bytes);
        continue;
      }
      const read = readText(bytes);
      texts.set(path, read.text);
      if (read.crlf) crlf.add(path);
    }
    return {
      id: nextId++,
      kind,
      name,
      handle,
      pending: false,
      binaries,
      texts,
      saved: new Map(texts),
      added: new Set(),
      fresh: new Set(),
      dirty: new Set(),
      dirs: new Set(dirs),
      main: findMain(texts),
      active: null,
      unsynced: false,
      version: 1,
      exportedAt: null,
      stamps: new Map(),
      crlf,
      twin: false,
      uid: newUid(),
      persisted: {},
    };
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
    const present = new Set([
      ...scan.same,
      ...scan.files.map(([path]) => path),
    ]);
    let touched = false;
    for (const path of [...s.texts.keys()])
      if (!present.has(path) && !s.dirty.has(path)) {
        s.texts.delete(path);
        s.saved.delete(path);
        touched = true;
      }
    for (const path of [...s.binaries.keys()])
      if (!present.has(path)) {
        s.binaries.delete(path);
        touched = true;
      }
    for (const [path, bytes] of scan.files) {
      if (!isEditablePath(path)) {
        s.binaries.set(path, bytes);
        touched = true;
        continue;
      }
      const { text, crlf } = readText(bytes);
      noteEol(s, path, crlf);
      if (s.saved.get(path) === text && s.texts.has(path)) continue;
      s.saved.set(path, text);
      s.added.delete(path);
      if (!s.dirty.has(path) || !s.texts.has(path)) s.texts.set(path, text);
      touched = true;
    }
    const dirs = new Set(scan.dirs);
    for (const path of s.texts.keys())
      for (const dir of parentDirs(path)) dirs.add(dir);
    if (dirs.size !== s.dirs.size || [...dirs].some((dir) => !s.dirs.has(dir)))
      touched = true;
    s.stamps = scan.stamps;
    if (!touched) return false;
    s.dirs = dirs;
    if (!s.main || !s.texts.has(s.main)) s.main = findMain(s.texts);
    if (s.active && !s.texts.has(s.active)) s.active = null;
    recountDirty(s);
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
    void persistMeta(true).then(() =>
      next.kind === "dir" ? dbPut({ [FILES_KEY]: undefined }) : undefined,
    );
    notify();
  }

  async function openDirHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    let writable = false;
    try {
      writable =
        (await handle.requestPermission?.({ mode: "readwrite" })) === "granted";
    } catch {}
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
    await openFileList(picked);
    return true;
  }

  async function openFileList(list: readonly File[]): Promise<void> {
    const limit = budget();
    const paths = list.map((file) => file.webkitRelativePath || file.name);
    const root = commonRoot(paths);
    const files: [string, Uint8Array][] = [];
    for (const [index, file] of list.entries()) {
      const path = cleanPath(rootedPath(paths[index]!, root));
      if (!path || skippedPath(path)) continue;
      limit.take(file.size);
      files.push([path, new Uint8Array(await file.arrayBuffer())]);
    }
    const dirs = new Set(files.flatMap(([path]) => parentDirs(path)));
    adopt(fromEntries("folder", root || "төсөл", null, files, dirs));
  }

  async function openZip(file: File): Promise<void> {
    const { unzipSync } = await import("fflate");
    let entries: Record<string, Uint8Array>;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let size: number;
    try {
      size = unpackedSize(bytes);
    } catch {
      throw new ProjectError("Zip файлыг задалж чадсангүй");
    }
    if (size > MAX_BYTES)
      throw new ProjectError("Төсөл хэт том байна (200 MB-аас ихгүй)");
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new ProjectError("Zip файлыг задалж чадсангүй");
    }
    const names = Object.keys(entries);
    const root = commonRoot(names.filter((name) => !name.endsWith("/")));
    const limit = budget();
    const files: [string, Uint8Array][] = [];
    const dirs = new Set<string>();
    for (const name of names) {
      const path = cleanPath(rootedPath(name, root));
      if (!path || skippedPath(path)) continue;
      if (name.endsWith("/")) {
        dirs.add(path);
        continue;
      }
      const bytes = entries[name]!;
      limit.take(bytes.length);
      files.push([path, bytes]);
      for (const dir of parentDirs(path)) dirs.add(dir);
    }
    adopt(
      fromEntries(
        "memory",
        root || file.name.replace(/\.zip$/i, ""),
        null,
        files,
        dirs,
      ),
    );
  }

  async function restoreProject(): Promise<boolean> {
    const meta = await dbGet<Meta>(META_KEY);
    if (!meta) return false;
    const edits = (await dbGet<Record<string, string>>(EDITS_KEY)) ?? {};
    if (meta.kind !== "dir") {
      const files = await dbGet<Record<string, Uint8Array>>(FILES_KEY);
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
    let granted = false;
    try {
      granted =
        (await meta.handle.queryPermission?.({ mode: "readwrite" })) ===
        "granted";
    } catch {}
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

  let pendingEdits: Record<string, string> = {};

  function applyRestored(
    next: State,
    meta: Meta,
    edits: Record<string, string>,
  ): void {
    for (const [path, text] of Object.entries(edits)) {
      if (!next.texts.has(path)) next.added.add(path);
      next.texts.set(path, text);
      for (const dir of parentDirs(path)) next.dirs.add(dir);
    }
    if (meta.main && next.texts.has(meta.main)) next.main = meta.main;
    next.exportedAt = meta.exportedAt ?? null;
    next.twin = meta.twin ?? false;
    next.uid = meta.uid ?? next.uid;
    next.persisted = { ...edits };
    next.active =
      meta.active && next.texts.has(meta.active) ? meta.active : next.main;
    recountDirty(next);
    state = next;
    notify();
  }

  async function grantProject(): Promise<boolean> {
    const s = state;
    if (!s?.pending || !s.handle) return false;
    let granted = false;
    try {
      granted =
        (await s.handle.requestPermission?.({ mode: "readwrite" })) ===
        "granted";
    } catch {}
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
    if (editsTimer) clearTimeout(editsTimer);
    editsTimer = 0;
    state = null;
    pendingEdits = {};
    void dbPut({
      [META_KEY]: undefined,
      [EDITS_KEY]: undefined,
      [FILES_KEY]: undefined,
    });
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
    void persistMeta();
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

  async function writeDisk(
    path: string,
    data: Uint8Array | string,
  ): Promise<void> {
    const root = diskRoot();
    if (root) await writeEntry(root, path, data);
  }

  function readDisk(path: string): Promise<Uint8Array | null> {
    const root = diskRoot();
    return root ? readEntry(root, path) : Promise.resolve(null);
  }

  async function removeDisk(path: string): Promise<void> {
    const root = diskRoot();
    if (root) await removeEntry(root, path);
  }

  function requireState(): State {
    const s = state;
    if (!s || s.pending) throw new ProjectError("Төсөл нээгдээгүй байна");
    return s;
  }

  async function createFile(path: string): Promise<void> {
    const s = requireState();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Файлын нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError("Ийм нэртэй зүйл байна");
    if (s.kind === "dir") await writeDisk(clean, new Uint8Array(0));
    if (isEditablePath(clean)) {
      s.texts.set(clean, "");
      s.saved.set(clean, "");
    } else s.binaries.set(clean, new Uint8Array(0));
    if (s.kind === "folder") s.fresh.add(clean);
    for (const dir of parentDirs(clean)) s.dirs.add(dir);
    s.unsynced = true;
    recountDirty(s);
    changed(true);
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
    if (s.kind === "dir") await writeDisk(clean, bytes);
    if (isEditablePath(clean)) {
      const { text, crlf } = readText(bytes);
      noteEol(s, clean, crlf);
      s.texts.set(clean, text);
      s.saved.set(clean, text);
      s.added.delete(clean);
    } else s.binaries.set(clean, bytes);
    if (s.kind === "folder") s.fresh.add(clean);
    for (const dir of parentDirs(clean)) s.dirs.add(dir);
    s.unsynced = true;
    recountDirty(s);
    changed(true);
  }

  async function createDir(path: string): Promise<void> {
    const s = requireState();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Хавтасны нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError("Ийм нэртэй зүйл байна");
    if (s.kind === "dir" && s.handle) await dirHandleFor(s.handle, clean, true);
    for (const dir of [...parentDirs(clean), clean]) s.dirs.add(dir);
    s.unsynced = true;
    recountDirty(s);
    changed(true);
  }

  async function moveDisk(
    s: State,
    from: string,
    source: string,
    target: string,
  ): Promise<void> {
    if (s.dirs.has(from) && s.handle) {
      let dir: FileSystemDirectoryHandle;
      try {
        dir = await dirHandleFor(s.handle, source, false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError")
          return;
        throw error;
      }
      await copyDir(dir, await dirHandleFor(s.handle, target, true));
      await removeDisk(source);
      return;
    }
    for (const [path, text] of s.saved) {
      const next = movedPath(path, from, target);
      if (next === null) continue;
      const bytes = await readDisk(movedPath(path, from, source) ?? path);
      await writeDisk(next, bytes ?? diskText(s, path, text));
    }
    for (const [path, bytes] of s.binaries) {
      const next = movedPath(path, from, target);
      if (next !== null) await writeDisk(next, bytes);
    }
    await removeDisk(source);
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
    if (s.kind === "dir") {
      if (sameOnDisk(from, target)) {
        const temp = joinPath(
          dirName(from),
          "." + baseName(from) + "-" + Date.now().toString(36),
        );
        await moveDisk(s, from, from, temp);
        await moveDisk(s, from, temp, target);
      } else await moveDisk(s, from, from, target);
    }
    movedKeys(s.texts, from, target);
    movedKeys(s.saved, from, target);
    s.crlf = new Set(
      [...s.crlf].map((path) => movedPath(path, from, target) ?? path),
    );
    movedKeys(s.binaries, from, target);
    s.added = new Set(
      [...s.added].map((path) => movedPath(path, from, target) ?? path),
    );
    s.fresh = new Set(
      [...s.fresh].map((path) => movedPath(path, from, target) ?? path),
    );
    s.dirs = new Set(
      [...s.dirs].map((dir) => movedPath(dir, from, target) ?? dir),
    );
    for (const dir of parentDirs(target)) s.dirs.add(dir);
    retype(s, target);
    if (s.main) s.main = movedPath(s.main, from, target) ?? s.main;
    if (s.active) s.active = movedPath(s.active, from, target) ?? s.active;
    if (s.main && !s.texts.has(s.main)) s.main = findMain(s.texts);
    if (s.active && !s.texts.has(s.active)) s.active = null;
    s.unsynced = true;
    recountDirty(s);
    changed(true);
  }

  async function removePath(path: string): Promise<void> {
    const s = requireState();
    if (s.kind === "dir") await removeDisk(path);
    for (const map of [s.texts, s.saved, s.binaries] as Map<string, unknown>[])
      for (const key of [...map.keys()]) if (within(key, path)) map.delete(key);
    for (const key of [...s.added]) if (within(key, path)) s.added.delete(key);
    for (const key of [...s.fresh]) if (within(key, path)) s.fresh.delete(key);
    for (const key of [...s.crlf]) if (within(key, path)) s.crlf.delete(key);
    for (const dir of [...s.dirs]) if (within(dir, path)) s.dirs.delete(dir);
    if (s.main && within(s.main, path)) s.main = findMain(s.texts);
    if (s.active && within(s.active, path)) s.active = null;
    s.unsynced = true;
    recountDirty(s);
    changed(true);
  }

  async function projectZip(): Promise<Blob> {
    const s = requireState();
    const { zipSync } = await import("fflate");
    const encoder = new TextEncoder();
    const entries: Record<string, Uint8Array> = {};
    for (const [path, text] of s.texts)
      entries[path] = encoder.encode(diskText(s, path, text));
    for (const [path, bytes] of s.binaries) entries[path] = bytes;
    for (const dir of s.dirs)
      if (![...Object.keys(entries)].some((path) => within(path, dir)))
        entries[dir + "/"] = new Uint8Array(0);
    return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], {
      type: "application/zip",
    });
  }

  async function saveProject(): Promise<SaveResult> {
    const s = requireState();
    if (s.kind === "dir") {
      const dirty = dirtySet(s);
      if (!dirty.size) return "clean";
      for (const path of dirty) {
        const text = s.texts.get(path);
        if (text === undefined) continue;
        await writeDisk(path, diskText(s, path, text));
        s.saved.set(path, text);
        s.added.delete(path);
      }
      s.unsynced = false;
      recountDirty(s);
      changed(true);
      return "saved";
    }
    if (s.kind === "folder") {
      const paths = new Set([
        ...[...dirtySet(s)].filter((path) => s.texts.has(path)),
        ...s.fresh,
      ]);
      if (!paths.size) return "clean";
      for (const path of paths) {
        const text = s.texts.get(path);
        if (text === undefined) {
          const bytes = s.binaries.get(path);
          if (bytes)
            download(
              new Blob([bytes as Uint8Array<ArrayBuffer>]),
              baseName(path),
            );
        } else {
          download(
            new Blob([diskText(s, path, text)], {
              type: "text/plain;charset=utf-8",
            }),
            baseName(path),
          );
          s.saved.set(path, text);
          s.added.delete(path);
        }
        s.fresh.delete(path);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      s.unsynced = false;
      recountDirty(s);
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
    const s = requireState();
    return { id: s.id, texts: new Map(s.texts), added: new Set(s.added) };
  }

  function markExported(snap: ProjectSnapshot = projectSnapshot()): void {
    const s = state;
    if (!s || s.id !== snap.id) return;
    s.exportedAt = Date.now();
    if (s.kind === "memory") {
      for (const [path, text] of snap.texts) s.saved.set(path, text);
      for (const path of snap.added) s.added.delete(path);
      s.unsynced = [...s.texts].some(
        ([path, text]) => snap.texts.get(path) !== text,
      );
      recountDirty(s);
    }
    changed(true);
  }

  function projectBuild(): Promise<ProjectBuild> {
    return buildProject(requireState());
  }

  return {
    onProjectChange,
    project,
    hasProject,
    setLinked,
    projectLinked,
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

export const {
  onProjectChange,
  project,
  hasProject,
  setLinked,
  projectLinked,
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
} = createProjectStore();
