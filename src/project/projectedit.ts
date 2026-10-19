import {
  findMain,
  isEditablePath,
  movedPath,
  parentDirs,
  within,
} from "../tex/texproject.ts";
import type { DirScan } from "./projectdisk.ts";
import {
  movedKeys,
  noteEol,
  readText,
  recountDirty,
  retype,
  type Meta,
  type State,
} from "./projectstate.ts";

export interface ProjectSnapshot {
  readonly id: number;
  readonly texts: ReadonlyMap<string, string>;
  readonly added: ReadonlySet<string>;
}

export function putFile(s: State, path: string, bytes: Uint8Array): void {
  if (isEditablePath(path)) {
    const { text, crlf } = readText(bytes);
    noteEol(s, path, crlf);
    s.texts.set(path, text);
    s.saved.set(path, text);
    s.added.delete(path);
  } else s.binaries.set(path, bytes);
  if (s.kind === "folder") s.fresh.add(path);
  for (const dir of parentDirs(path)) s.dirs.add(dir);
  s.unsynced = true;
  recountDirty(s);
}

export function putDir(s: State, path: string): void {
  for (const dir of [...parentDirs(path), path]) s.dirs.add(dir);
  s.unsynced = true;
  recountDirty(s);
}

export function moveEntries(s: State, from: string, target: string): void {
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
}

export function dropEntries(s: State, path: string): void {
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
}

function pruneMissing(s: State, present: ReadonlySet<string>): boolean {
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
  return touched;
}

function mergeFile(s: State, path: string, bytes: Uint8Array): boolean {
  if (!isEditablePath(path)) {
    s.binaries.set(path, bytes);
    return true;
  }
  const { text, crlf } = readText(bytes);
  noteEol(s, path, crlf);
  if (s.saved.get(path) === text && s.texts.has(path)) return false;
  s.saved.set(path, text);
  s.added.delete(path);
  if (!s.dirty.has(path) || !s.texts.has(path)) s.texts.set(path, text);
  return true;
}

function scannedDirs(s: State, scan: DirScan): Set<string> {
  const dirs = new Set(scan.dirs);
  for (const path of s.texts.keys())
    for (const dir of parentDirs(path)) dirs.add(dir);
  return dirs;
}

export function applyScan(s: State, scan: DirScan): boolean {
  const present = new Set([...scan.same, ...scan.files.map(([path]) => path)]);
  let touched = pruneMissing(s, present);
  for (const [path, bytes] of scan.files)
    if (mergeFile(s, path, bytes)) touched = true;
  const dirs = scannedDirs(s, scan);
  if (dirs.size !== s.dirs.size || [...dirs].some((dir) => !s.dirs.has(dir)))
    touched = true;
  s.stamps = scan.stamps;
  if (!touched) return false;
  s.dirs = dirs;
  if (!s.main || !s.texts.has(s.main)) s.main = findMain(s.texts);
  if (s.active && !s.texts.has(s.active)) s.active = null;
  recountDirty(s);
  return true;
}

export function applyEdits(
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
}

export function snapshotOf(s: State): ProjectSnapshot {
  return { id: s.id, texts: new Map(s.texts), added: new Set(s.added) };
}

export function markZipped(s: State, snap: ProjectSnapshot): void {
  for (const [path, text] of snap.texts) s.saved.set(path, text);
  for (const path of snap.added) s.added.delete(path);
  s.unsynced = [...s.texts].some(
    ([path, text]) => snap.texts.get(path) !== text,
  );
  recountDirty(s);
}
