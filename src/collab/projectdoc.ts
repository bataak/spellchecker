import * as Y from "yjs";
import { randomId } from "./collabkey.ts";
import { minimalDiff } from "../mdbar/mdedit.ts";
import { unsafeName } from "./safetext.ts";
import { movedPath, skippedPath, within } from "../tex/texproject.ts";

export interface BlobRef {
  readonly hash: string;
  readonly size: number;
}

export interface ProjectSnapshot {
  readonly texts: ReadonlyMap<string, string>;
  readonly blobs: ReadonlyMap<string, BlobRef>;
  readonly dirs: ReadonlySet<string>;
  readonly main: string | null;
}

type Entry = Y.Map<unknown>;

export const MAX_BLOB = 20 * 1024 * 1024;

const FILES = "files";
const DIRS = "dirs";
const META = "meta";
const PATH = "path";
const TEXT = "text";
const HASH = "hash";
const SIZE = "size";
const MAIN = "main";
const MAX_PATH = 1024;
const ODD_PARTS = new Set(["", ".", ".."]);

function files(doc: Y.Doc): Y.Map<Entry> {
  return doc.getMap<Entry>(FILES);
}

function dirs(doc: Y.Doc): Y.Map<boolean> {
  return doc.getMap<boolean>(DIRS);
}

function meta(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>(META);
}

export function outputPdf(main: string | null): string | null {
  return main ? main.replace(/\.(tex|ltx)$/i, "") + ".pdf" : null;
}

function safePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= MAX_PATH &&
    !unsafeName(path) &&
    !path.split("/").some((part) => ODD_PARTS.has(part))
  );
}

export function sharedPath(path: string, main: string | null): boolean {
  return safePath(path) && !skippedPath(path) && path !== outputPdf(main);
}

function mainOf(doc: Y.Doc): string | null {
  const main: unknown = meta(doc).get(MAIN);
  return safePath(main) ? main : null;
}

function pathOf(entry: Entry): string {
  const path = entry.get(PATH);
  return safePath(path) ? path : "";
}

function numbered(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const cut = dot > slash + 1 ? dot : path.length;
  return path.slice(0, cut) + " (" + n + ")" + path.slice(cut);
}

function resolved(doc: Y.Doc): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const sorted = [...files(doc)].sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [, entry] of sorted) {
    const path = pathOf(entry);
    if (!path) continue;
    let free = path;
    for (let n = 2; out.has(free); n++) free = numbered(path, n);
    out.set(free, entry);
  }
  return out;
}

function addEntry(
  doc: Y.Doc,
  path: string,
  fill: (entry: Entry) => void,
): void {
  const entry = new Y.Map<unknown>();
  entry.set(PATH, path);
  fill(entry);
  files(doc).set(randomId(9), entry);
}

export function addText(doc: Y.Doc, path: string, text: string): void {
  addEntry(doc, path, (entry) => entry.set(TEXT, new Y.Text(text)));
}

export function addBlob(doc: Y.Doc, path: string, ref: BlobRef): void {
  addEntry(doc, path, (entry) => {
    entry.set(HASH, ref.hash);
    entry.set(SIZE, ref.size);
  });
}

export function setBlob(doc: Y.Doc, path: string, ref: BlobRef): void {
  const entry = resolved(doc).get(path);
  if (!entry || entry.get(TEXT) instanceof Y.Text) return;
  doc.transact(() => {
    entry.set(HASH, ref.hash);
    entry.set(SIZE, ref.size);
  });
}

export function addDir(doc: Y.Doc, path: string): void {
  dirs(doc).set(path, true);
}

export function setMain(doc: Y.Doc, path: string | null): void {
  if (path) meta(doc).set(MAIN, path);
  else meta(doc).delete(MAIN);
}

export function seedProject(doc: Y.Doc, snap: ProjectSnapshot): void {
  doc.transact(() => {
    for (const [path, text] of snap.texts)
      if (sharedPath(path, snap.main)) addText(doc, path, text);
    for (const [path, ref] of snap.blobs)
      if (sharedPath(path, snap.main)) addBlob(doc, path, ref);
    for (const dir of snap.dirs) if (!skippedPath(dir)) addDir(doc, dir);
    setMain(doc, snap.main);
  });
}

export function removePath(doc: Y.Doc, path: string): void {
  doc.transact(() => {
    for (const [id, entry] of [...files(doc)])
      if (within(pathOf(entry), path)) files(doc).delete(id);
    for (const dir of [...dirs(doc).keys()])
      if (within(dir, path)) dirs(doc).delete(dir);
    const main = mainOf(doc);
    if (main && within(main, path)) setMain(doc, null);
  });
}

export function dropDir(doc: Y.Doc, path: string): void {
  for (const dir of [...dirs(doc).keys()])
    if (within(dir, path)) dirs(doc).delete(dir);
}

export function movePath(doc: Y.Doc, from: string, to: string): void {
  doc.transact(() => {
    for (const entry of files(doc).values()) {
      const next = movedPath(pathOf(entry), from, to);
      if (next !== null) entry.set(PATH, next);
    }
    for (const dir of [...dirs(doc).keys()]) {
      const next = movedPath(dir, from, to);
      if (next === null) continue;
      dirs(doc).delete(dir);
      dirs(doc).set(next, true);
    }
    const main = mainOf(doc);
    const moved = main ? movedPath(main, from, to) : null;
    if (moved !== null) setMain(doc, moved);
  });
}

export function fileIds(doc: Y.Doc): Map<string, string> {
  const ids = new Map<Entry, string>();
  for (const [id, entry] of files(doc)) ids.set(entry, id);
  const out = new Map<string, string>();
  for (const [path, entry] of resolved(doc)) out.set(path, ids.get(entry)!);
  return out;
}

export function writeText(doc: Y.Doc, path: string, next: string): void {
  const text = textOf(doc, path);
  if (!text) return;
  const patch = minimalDiff(text.toString(), next);
  if (!patch) return;
  doc.transact(() => {
    if (patch.to > patch.from) text.delete(patch.from, patch.to - patch.from);
    if (patch.insert) text.insert(patch.from, patch.insert);
  });
}

export function textOf(doc: Y.Doc, path: string): Y.Text | null {
  const text = resolved(doc).get(path)?.get(TEXT);
  return text instanceof Y.Text ? text : null;
}

const textCaches = new WeakMap<Y.Doc, WeakMap<Y.Text, string>>();

function stringOf(doc: Y.Doc, text: Y.Text): string {
  let cache = textCaches.get(doc);
  if (!cache) {
    const fresh = new WeakMap<Y.Text, string>();
    files(doc).observeDeep((events) => {
      for (const event of events)
        if (event.target instanceof Y.Text) fresh.delete(event.target);
    });
    textCaches.set(doc, fresh);
    cache = fresh;
  }
  let value = cache.get(text);
  if (value === undefined) {
    value = text.toString();
    cache.set(text, value);
  }
  return value;
}

function blobOf(entry: Entry): BlobRef | null {
  const hash = entry.get(HASH);
  const size = entry.get(SIZE);
  return typeof hash === "string" && typeof size === "number"
    ? { hash, size }
    : null;
}

export function textsOf(doc: Y.Doc): Map<string, Y.Text> {
  const out = new Map<string, Y.Text>();
  for (const [path, entry] of resolved(doc)) {
    const text = entry.get(TEXT);
    if (text instanceof Y.Text) out.set(path, text);
  }
  return out;
}

export function blobsOf(doc: Y.Doc): Map<string, BlobRef> {
  const blobs = new Map<string, BlobRef>();
  for (const [path, entry] of resolved(doc)) {
    const ref = entry.get(TEXT) instanceof Y.Text ? null : blobOf(entry);
    if (ref) blobs.set(path, ref);
  }
  return blobs;
}

export function projectOf(doc: Y.Doc): ProjectSnapshot {
  const texts = new Map<string, string>();
  const blobs = new Map<string, BlobRef>();
  for (const [path, entry] of resolved(doc)) {
    const text = entry.get(TEXT);
    const ref = blobOf(entry);
    if (text instanceof Y.Text) texts.set(path, stringOf(doc, text));
    else if (ref) blobs.set(path, ref);
  }
  return {
    texts,
    blobs,
    dirs: new Set([...dirs(doc).keys()].filter(safePath)),
    main: mainOf(doc),
  };
}

export async function blobHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function snapshotOf(
  texts: ReadonlyMap<string, string>,
  binaries: ReadonlyMap<string, Uint8Array>,
  dirs: Iterable<string>,
  main: string | null,
): Promise<ProjectSnapshot> {
  const blobs = new Map<string, BlobRef>();
  for (const [path, bytes] of binaries)
    if (sharedPath(path, main) && bytes.length <= MAX_BLOB)
      blobs.set(path, { hash: await blobHash(bytes), size: bytes.length });
  return { texts, blobs, dirs: new Set(dirs), main };
}
