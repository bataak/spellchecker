import { decodeFileBytes } from "../archive/cp1251.ts";
import {
  findMain,
  isEditablePath,
  movedPath,
  sameOnDisk,
  within,
} from "../tex/texproject.ts";

export type ProjectKind = "dir" | "folder" | "memory";

export interface Meta {
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

export interface State {
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

export function markDirty(s: State, path: string): void {
  if (s.added.has(path) || s.saved.get(path) !== s.texts.get(path))
    s.dirty.add(path);
  else s.dirty.delete(path);
}

export function recountDirty(s: State): void {
  s.dirty = new Set(s.added);
  for (const path of s.texts.keys()) markDirty(s, path);
}

export function metaOf(s: State): Meta {
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

export function editsOf(s: State): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of s.dirty) out[path] = s.texts.get(path) ?? "";
  return out;
}

export function readText(bytes: Uint8Array): { text: string; crlf: boolean } {
  const raw = decodeFileBytes(bytes);
  return { text: raw.replace(/\r\n?/g, "\n"), crlf: raw.includes("\r\n") };
}

export function diskText(s: State, path: string, text: string): string {
  return s.crlf.has(path) ? text.replace(/\n/g, "\r\n") : text;
}

export function noteEol(s: State, path: string, crlf: boolean): void {
  if (crlf) s.crlf.add(path);
  else s.crlf.delete(path);
}

export function savedFilesOf(s: State): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();
  for (const [path, text] of s.saved)
    if (!s.added.has(path)) out[path] = encoder.encode(diskText(s, path, text));
  for (const [path, bytes] of s.binaries) out[path] = bytes;
  return out;
}

export function newUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function exists(s: State, path: string, moving?: string): boolean {
  if (s.texts.has(path) || s.binaries.has(path) || s.dirs.has(path))
    return true;
  if (s.kind !== "dir") return false;
  return [...s.texts.keys(), ...s.binaries.keys(), ...s.dirs].some(
    (key) =>
      sameOnDisk(key, path) && (moving === undefined || !within(key, moving)),
  );
}

export function movedKeys<T>(
  map: Map<string, T>,
  from: string,
  to: string,
): void {
  for (const [path, value] of [...map]) {
    const next = movedPath(path, from, to);
    if (next === null) continue;
    map.delete(path);
    map.set(next, value);
  }
}

export function retype(s: State, path: string): void {
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

export function newState(
  id: number,
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
    id,
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

export function withStamps(next: State, stamps: Map<string, string>): State {
  next.stamps = stamps;
  return next;
}
