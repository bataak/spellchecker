import { decodeFileBytes } from "./cp1251.ts";
import {
  baseName,
  cleanPath,
  commonRoot,
  compilePasses,
  dirName,
  expandMacros,
  findMain,
  graphicRefs,
  graphicsPaths,
  isEditablePath,
  isLatexDocument,
  isPdfGraphic,
  isTexSource,
  joinPath,
  mapGraphics,
  movedPath,
  parentDirs,
  pathMacros,
  resolveGraphic,
  rootedPath,
  skippedPath,
  within,
} from "./texproject.ts";

const MAX_FILES = 3000;
const MAX_BYTES = 200 * 1024 * 1024;
const DB_NAME = "bichig-project";
const DB_STORE = "kv";
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

export interface ProjectBuild {
  readonly main: string;
  readonly mainText: string;
  readonly files: Record<string, Uint8Array | string>;
  readonly dirs: readonly string[];
  readonly passes: number;
  readonly missing: readonly string[];
}

export class ProjectError extends Error {}

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

let state: State | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
let editsTimer = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

export function onProjectChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

export function project(): ProjectView | null {
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
    unsaved: dirty.size > 0 || (s.kind === "memory" && s.unsynced),
    pending: s.pending,
    version: s.version,
    exportedAt: s.exportedAt,
    uid: s.uid,
  };
}

let linked = false;

export function hasProject(): boolean {
  return state !== null && !state.pending;
}

export function setLinked(on: boolean): void {
  linked = on;
}

export function projectLinked(): boolean {
  return linked && hasProject();
}

export function projectBinary(path: string): Uint8Array | null {
  return state?.binaries.get(path) ?? null;
}

export function projectText(path: string): string | null {
  return state?.texts.get(path) ?? null;
}

export function projectSavedText(path: string): string | null {
  return state?.saved.get(path) ?? null;
}

export function projectKey(): string | null {
  return state && !state.pending ? String(state.version) : null;
}

let digestMemo: { id: number; version: number; value: string } | null = null;

export async function projectDigest(): Promise<string | null> {
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
    parts.push(encoder.encode(path + "\u0000" + data.length + "\u0000"), data);
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function dbPut(entries: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      for (const [key, value] of Object.entries(entries))
        if (value === undefined) store.delete(key);
        else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
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

if (typeof window !== "undefined") {
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

function budget(): { take: (size: number) => void } {
  let files = 0;
  let bytes = 0;
  return {
    take(size) {
      files += 1;
      bytes += size;
      if (files > MAX_FILES)
        throw new ProjectError(
          "Төсөлд хэт олон файл байна (" + MAX_FILES + "-аас ихгүй)",
        );
      if (bytes > MAX_BYTES)
        throw new ProjectError("Төсөл хэт том байна (200 MB-аас ихгүй)");
    },
  };
}

interface DirScan {
  readonly files: [string, Uint8Array][];
  readonly same: string[];
  readonly dirs: string[];
  readonly stamps: Map<string, string>;
}

async function readDir(
  dir: FileSystemDirectoryHandle,
  known: ReadonlyMap<string, string> = new Map(),
): Promise<DirScan> {
  const files: [string, Uint8Array][] = [];
  const same: string[] = [];
  const dirs: string[] = [];
  const stamps = new Map<string, string>();
  const limit = budget();
  const walk = async (
    handle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> => {
    for await (const entry of (
      handle as FileSystemDirectoryHandle & {
        values(): AsyncIterable<FileSystemHandle>;
      }
    ).values()) {
      const path = joinPath(prefix, entry.name);
      if (skippedPath(path)) continue;
      if (entry.kind === "directory") {
        dirs.push(path);
        await walk(entry as FileSystemDirectoryHandle, path);
        continue;
      }
      const file = await (entry as FileSystemFileHandle).getFile();
      limit.take(file.size);
      const stamp = file.size + ":" + file.lastModified;
      stamps.set(path, stamp);
      if (known.get(path) === stamp) same.push(path);
      else files.push([path, new Uint8Array(await file.arrayBuffer())]);
    }
  };
  await walk(dir, "");
  return { files, same, dirs, stamps };
}

function withStamps(next: State, stamps: Map<string, string>): State {
  next.stamps = stamps;
  return next;
}

let refreshing: Promise<boolean> | null = null;

export function refreshProject(): Promise<boolean> {
  refreshing ??= refreshFromDisk().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refreshFromDisk(): Promise<boolean> {
  const s = state;
  if (!s || s.pending || s.kind !== "dir" || !s.handle) return false;
  try {
    if ((await s.handle.queryPermission?.({ mode: "readwrite" })) !== "granted")
      return false;
  } catch {
    return false;
  }
  const scan = await readDir(s.handle, s.stamps);
  if (state !== s) return false;
  const present = new Set([...scan.same, ...scan.files.map(([path]) => path)]);
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

export async function openDirHandle(
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

export async function pickFolder(
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

export async function openZip(file: File): Promise<void> {
  const { unzipSync } = await import("fflate");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
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

export async function restoreProject(): Promise<boolean> {
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

export async function grantProject(): Promise<boolean> {
  const s = state;
  if (!s?.pending || !s.handle) return false;
  let granted = false;
  try {
    granted =
      (await s.handle.requestPermission?.({ mode: "readwrite" })) === "granted";
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

export function closeProject(): void {
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

export function setProjectText(path: string, text: string): void {
  const s = state;
  if (!s || s.pending || !s.texts.has(path) || s.texts.get(path) === text)
    return;
  s.texts.set(path, text);
  markDirty(s, path);
  changed(false);
}

export function setActive(path: string | null): void {
  const s = state;
  if (!s || s.active === path) return;
  s.active = path;
  void persistMeta();
  notify();
}

export function setMain(path: string): void {
  const s = state;
  const text = s?.texts.get(path);
  if (!s || !isTexSource(path) || text === undefined || s.main === path) return;
  if (!isLatexDocument(text)) return;
  s.main = path;
  changed(true);
}

async function dirHandleFor(
  root: FileSystemDirectoryHandle,
  dir: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of dir ? dir.split("/") : [])
    current = await current.getDirectoryHandle(part, { create });
  return current;
}

async function writeDisk(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  const s = state;
  if (!s?.handle || s.kind !== "dir") return;
  const dir = await dirHandleFor(s.handle, dirName(path), true);
  const file = await dir.getFileHandle(baseName(path), { create: true });
  const stream = await file.createWritable();
  await stream.write(
    typeof data === "string"
      ? data
      : new Blob([data as Uint8Array<ArrayBuffer>]),
  );
  await stream.close();
}

async function removeDisk(path: string): Promise<void> {
  const s = state;
  if (!s?.handle || s.kind !== "dir") return;
  try {
    const dir = await dirHandleFor(s.handle, dirName(path), false);
    await dir.removeEntry(baseName(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError"))
      throw error;
  }
}

function exists(s: State, path: string): boolean {
  return s.texts.has(path) || s.binaries.has(path) || s.dirs.has(path);
}

function requireState(): State {
  const s = state;
  if (!s || s.pending) throw new ProjectError("Төсөл нээгдээгүй байна");
  return s;
}

export async function createFile(path: string): Promise<void> {
  const s = requireState();
  const clean = cleanPath(path);
  if (!clean) throw new ProjectError("Файлын нэр буруу байна");
  if (exists(s, clean)) throw new ProjectError("Ийм нэртэй зүйл байна");
  if (s.kind === "dir") await writeDisk(clean, new Uint8Array(0));
  if (isEditablePath(clean)) {
    s.texts.set(clean, "");
    s.saved.set(clean, "");
  } else s.binaries.set(clean, new Uint8Array(0));
  for (const dir of parentDirs(clean)) s.dirs.add(dir);
  s.unsynced = true;
  recountDirty(s);
  changed(true);
}

export async function addFile(path: string, bytes: Uint8Array): Promise<void> {
  const s = requireState();
  const clean = cleanPath(path);
  if (!clean) throw new ProjectError("Файлын нэр буруу байна");
  if (s.kind === "dir") await writeDisk(clean, bytes);
  if (isEditablePath(clean)) {
    const { text, crlf } = readText(bytes);
    noteEol(s, clean, crlf);
    s.texts.set(clean, text);
    s.saved.set(clean, text);
  } else s.binaries.set(clean, bytes);
  for (const dir of parentDirs(clean)) s.dirs.add(dir);
  s.unsynced = true;
  recountDirty(s);
  changed(true);
}

export async function createDir(path: string): Promise<void> {
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

function movedKeys<T>(map: Map<string, T>, from: string, to: string): void {
  for (const [path, value] of [...map]) {
    const next = movedPath(path, from, to);
    if (next === null) continue;
    map.delete(path);
    map.set(next, value);
  }
}

export async function renamePath(from: string, to: string): Promise<void> {
  const s = requireState();
  const target = cleanPath(to);
  if (!target) throw new ProjectError("Нэр буруу байна");
  if (target === from) return;
  if (exists(s, target)) throw new ProjectError("Ийм нэртэй зүйл байна");
  if (within(target, from))
    throw new ProjectError("Хавтсыг өөр дотор нь зөөх боломжгүй");
  if (s.kind === "dir") {
    for (const [path, text] of s.saved) {
      const next = movedPath(path, from, target);
      if (next !== null) await writeDisk(next, diskText(s, path, text));
    }
    for (const [path, bytes] of s.binaries) {
      const next = movedPath(path, from, target);
      if (next !== null) await writeDisk(next, bytes);
    }
    if (s.dirs.has(from) && s.handle)
      for (const dir of s.dirs) {
        const next = movedPath(dir, from, target);
        if (next !== null) await dirHandleFor(s.handle, next, true);
      }
    await removeDisk(from);
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
  s.dirs = new Set(
    [...s.dirs].map((dir) => movedPath(dir, from, target) ?? dir),
  );
  for (const dir of parentDirs(target)) s.dirs.add(dir);
  if (s.main) s.main = movedPath(s.main, from, target) ?? s.main;
  if (s.active) s.active = movedPath(s.active, from, target) ?? s.active;
  s.unsynced = true;
  recountDirty(s);
  changed(true);
}

export async function removePath(path: string): Promise<void> {
  const s = requireState();
  if (s.kind === "dir") await removeDisk(path);
  for (const map of [s.texts, s.saved, s.binaries] as Map<string, unknown>[])
    for (const key of [...map.keys()]) if (within(key, path)) map.delete(key);
  for (const key of [...s.added]) if (within(key, path)) s.added.delete(key);
  for (const key of [...s.crlf]) if (within(key, path)) s.crlf.delete(key);
  for (const dir of [...s.dirs]) if (within(dir, path)) s.dirs.delete(dir);
  if (s.main && within(s.main, path)) s.main = findMain(s.texts);
  if (s.active && within(s.active, path)) s.active = null;
  s.unsynced = true;
  recountDirty(s);
  changed(true);
}

export async function projectZip(): Promise<Blob> {
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

export type SaveResult = "saved" | "downloaded" | "files" | "clean";

export async function saveProject(): Promise<SaveResult> {
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
    const dirty = [...dirtySet(s)].filter((path) => s.texts.has(path));
    if (!dirty.length) return "clean";
    for (const path of dirty) {
      const text = s.texts.get(path)!;
      download(
        new Blob([diskText(s, path, text)], {
          type: "text/plain;charset=utf-8",
        }),
        baseName(path),
      );
      s.saved.set(path, text);
      s.added.delete(path);
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

export async function exportZip(): Promise<void> {
  const s = requireState();
  download(await projectZip(), s.name + ".zip");
  s.exportedAt = Date.now();
  if (s.kind === "memory") {
    for (const [path, text] of s.texts) s.saved.set(path, text);
    s.added.clear();
    s.unsynced = false;
    recountDirty(s);
  }
  changed(true);
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

async function toPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([bytes as Uint8Array<ArrayBuffer>]),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function projectBuild(): Promise<ProjectBuild> {
  const s = requireState();
  const main = s.main;
  if (!main)
    throw new ProjectError("Төслийн үндсэн .tex файл тодорхойгүй байна");
  const root = dirName(main);
  const has = (path: string): boolean =>
    s.binaries.has(path) || s.texts.has(path);
  const search = [...s.texts.values()].flatMap(graphicsPaths);
  const macros = pathMacros(s.texts.values());
  const missing: string[] = [];
  const converted = new Map<string, string>();
  const files: Record<string, Uint8Array | string> = {};
  const dirs = new Set<string>();
  const put = (path: string, data: Uint8Array | string): void => {
    const target = rootedPath(path, root);
    files[target] = data;
    for (const dir of parentDirs(target)) dirs.add(dir);
  };
  const resolved = new Map<string, string | null>();
  for (const text of s.texts.values())
    for (const raw of graphicRefs(text)) {
      if (resolved.has(raw)) continue;
      const wanted = expandMacros(raw, macros);
      const path = resolveGraphic(wanted, root, search, has);
      resolved.set(raw, path);
      if (path === null) {
        missing.push(wanted.trim());
        continue;
      }
      if (isPdfGraphic(path) || converted.has(path)) continue;
      const png = await toPng(s.binaries.get(path) ?? new Uint8Array(0));
      if (!png) {
        resolved.set(raw, null);
        missing.push(wanted.trim());
        continue;
      }
      const name = path.replace(/\.[^./]*$/, "") + ".converted.png";
      converted.set(path, name);
      put(name, png);
    }
  const graphic = (raw: string): string | null => {
    const path = resolved.get(raw) ?? null;
    if (path === null) return null;
    const name = converted.get(path);
    return name ? rootedPath(name, root) : raw;
  };
  let mainText = "";
  for (const [path, text] of s.texts) {
    const body = isTexSource(path) ? mapGraphics(text, graphic, (raw) => expandMacros(raw, macros).trim()) : text;
    if (path === main) mainText = body;
    else put(path, body);
  }
  for (const [path, bytes] of s.binaries) put(path, bytes);
  return {
    main: rootedPath(main, root),
    mainText,
    files,
    dirs: [...dirs].sort((a, b) => a.split("/").length - b.split("/").length),
    passes: compilePasses(s.texts.values()),
    missing,
  };
}
