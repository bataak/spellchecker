import { replaceRange } from "./editortext.ts";
import { pickImage } from "./images.ts";

const INCLUDE = /\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g;
const EXAMPLE_BASE = "examples/";
const EXAMPLE_IMAGES: ReadonlySet<string> = new Set([
  "img/transformer-model-architecture.png",
  "img/scaled-dot-product-attention.png",
  "img/multi-head-attention.png",
]);
const DB_NAME = "bichig-tex";
const DB_STORE = "handles";
const DIR_KEY = "imageDir";
const DIRECT_TYPES = new Set(["image/png", "image/jpeg"]);

export interface TexImages {
  readonly files: Record<string, Uint8Array>;
  readonly missing: readonly string[];
  readonly rewrite: (tex: string) => string;
}

export function normalizeTexPath(path: string): string {
  return path.trim().replace(/^(?:\.\/)+/, "");
}

export function texImagePaths(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(INCLUDE)) {
    const path = normalizeTexPath(match[2] ?? "");
    if (path) out.add(path);
  }
  return [...out];
}

export function rewriteIncludes(
  text: string,
  names: ReadonlyMap<string, string>,
): string {
  return text.replace(INCLUDE, (_, opts: string | undefined, raw: string) => {
    const path = normalizeTexPath(raw);
    const name = names.get(path);
    if (name) return "\\includegraphics" + (opts ?? "") + "{" + name + "}";
    return "\\fbox{\\ttfamily\\detokenize{" + path + "}}";
  });
}

const local = new Map<string, Blob>();
const fetched = new Map<string, Blob>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function onTexImagesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function asset(path: string): string {
  return import.meta.env.BASE_URL + path;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savedDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db
        .transaction(DB_STORE)
        .objectStore(DB_STORE)
        .get(DIR_KEY);
      request.onsuccess = () =>
        resolve((request.result as FileSystemDirectoryHandle) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveDir(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function fromDir(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<Blob | null> {
  const parts = path.split("/").filter((part) => part && part !== ".");
  const file = parts.pop();
  if (!file || parts.includes("..")) return null;
  try {
    let current = dir;
    for (const part of parts) current = await current.getDirectoryHandle(part);
    return await (await current.getFileHandle(file)).getFile();
  } catch {
    return null;
  }
}

async function readableDir(): Promise<FileSystemDirectoryHandle | null> {
  const dir = await savedDir();
  if (!dir) return null;
  try {
    return (await dir.queryPermission?.({ mode: "read" })) === "granted"
      ? dir
      : null;
  } catch {
    return null;
  }
}

async function resolveImage(
  path: string,
  dir: FileSystemDirectoryHandle | null,
): Promise<Blob | null> {
  const known = local.get(path) ?? fetched.get(path);
  if (known) return known;
  if (EXAMPLE_IMAGES.has(path)) {
    try {
      const response = await fetch(asset(EXAMPLE_BASE + path));
      if (response.ok) {
        const blob = await response.blob();
        fetched.set(path, blob);
        return blob;
      }
    } catch {}
  }
  return dir ? fromDir(dir, path) : null;
}

async function encode(
  blob: Blob,
): Promise<{ bytes: Uint8Array; ext: string } | null> {
  if (DIRECT_TYPES.has(blob.type))
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      ext: blob.type === "image/png" ? "png" : "jpg",
    };
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    return png
      ? { bytes: new Uint8Array(await png.arrayBuffer()), ext: "png" }
      : null;
  } catch {
    return null;
  }
}

export async function texImageFiles(text: string): Promise<TexImages> {
  const paths = texImagePaths(text);
  const dir = paths.length ? await readableDir() : null;
  const names = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  for (const path of paths) {
    const blob = await resolveImage(path, dir);
    const file = blob ? await encode(blob) : null;
    if (!file) {
      missing.push(path);
      continue;
    }
    const name = "image" + String(names.size + 1) + "." + file.ext;
    names.set(path, name);
    files[name] = file.bytes;
  }
  return { files, missing, rewrite: (tex) => rewriteIncludes(tex, names) };
}

export async function chooseImageFolder(): Promise<void> {
  const saved = await savedDir();
  if (saved?.requestPermission) {
    try {
      if ((await saved.requestPermission({ mode: "read" })) === "granted") {
        const pending = await readableDir();
        if (pending) {
          notify();
          return;
        }
      }
    } catch {}
  }
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      await saveDir(dir);
      notify();
    } catch {}
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.setAttribute("webkitdirectory", "");
  input.addEventListener("change", () => {
    for (const file of input.files ?? []) {
      const relative = file.webkitRelativePath.split("/").slice(1).join("/");
      if (relative) local.set(normalizeTexPath(relative), file);
    }
    notify();
  });
  input.click();
}

function uniqueName(name: string): string {
  const clean = name.replace(/[\s{}%#\\$&^~]+/g, "-") || "image.png";
  if (!local.has(clean)) return clean;
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let n = 2;
  while (local.has(stem + "-" + n + ext)) n++;
  return stem + "-" + n + ext;
}

function addImage(file: File): string {
  const name = uniqueName(file.name);
  local.set(name, file);
  return name;
}

function imageFilesOf(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) =>
    file.type.startsWith("image/"),
  );
}

export interface TexImageInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
}

export function initTexImageInput(deps: TexImageInputDeps): void {
  const { editor } = deps;

  const insert = (files: File[]): void => {
    const lines = files.map(
      (file) => "\\includegraphics[width=\\linewidth]{" + addImage(file) + "}",
    );
    const start = editor.selectionStart;
    const text = lines.join("\n");
    editor.focus({ preventScroll: true });
    if (!replaceRange(editor, start, editor.selectionEnd, text))
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    notify();
  };

  editor.addEventListener(
    "drop",
    (event) => {
      if (!deps.active()) return;
      const files = imageFilesOf(event.dataTransfer);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.classList.remove("drag-over");
      insert(files);
    },
    true,
  );

  editor.addEventListener("paste", (event) => {
    if (!deps.active()) return;
    const files = imageFilesOf(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    insert(files);
  });
}

export async function insertPickedImage(
  editor: HTMLTextAreaElement,
): Promise<void> {
  const text = editor.value;
  let start = editor.selectionStart;
  let end = editor.selectionEnd;
  const file = await pickImage();
  if (!file) return;
  if (editor.value !== text) {
    start = editor.selectionStart;
    end = editor.selectionEnd;
  }
  const name = addImage(file);
  editor.focus({ preventScroll: true });
  if (!replaceRange(editor, start, end, name))
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  notify();
}
