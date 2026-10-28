import { isHeic, jpegIfHeic } from "../files/heic.ts";
import { databaseOpener } from "../core/idb.ts";
import { replaceRange } from "../editor/editortext.ts";
import { pickImage } from "../files/images.ts";
import { expandMacros, pathMacros, uncommented } from "./texproject.ts";
import {
  rewriteSvg,
  svgCandidates,
  svgRefs,
  svgToPdf,
  usesSvgPackage,
} from "./texsvg.ts";
import { noteError } from "../core/errorlog.ts";
import { attemptAsync } from "../core/attempt.ts";

const INCLUDE =
  /\\includegraphics\s*((?:\*\s*)?(?:\[[^\]]*\]\s*)*)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
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
const IMAGE_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".PNG",
  ".JPG",
  ".JPEG",
  ".svg",
  ".SVG",
];

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
  const macros = pathMacros([text]);
  for (const match of uncommented(text).matchAll(INCLUDE)) {
    const path = normalizeTexPath(expandMacros(match[2] ?? "", macros));
    if (path) out.add(path);
  }
  return [...out];
}

export function rewriteIncludes(
  text: string,
  names: ReadonlyMap<string, string>,
  keep = false,
): string {
  const macros = pathMacros([text]);
  return text.replace(
    INCLUDE,
    (match: string, opts: string | undefined, raw: string) => {
      const path = normalizeTexPath(expandMacros(raw, macros));
      const name = names.get(path);
      if (name) return "\\includegraphics" + (opts ?? "") + "{" + name + "}";
      if (keep) return match;
      return "\\fbox{\\ttfamily\\detokenize{" + path + "}}";
    },
  );
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

const openDb = databaseOpener(DB_NAME, (db) => db.createObjectStore(DB_STORE));

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
  } catch (error) {
    noteError(error);
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
  } catch (error) {
    noteError(error);
  }
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

export function imageCandidates(path: string): string[] {
  return /\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1))
    ? [path]
    : [path, ...IMAGE_EXTS.map((ext) => path + ext)];
}

async function resolveImage(
  path: string,
  dir: FileSystemDirectoryHandle | null,
): Promise<{ blob: Blob; path: string } | null> {
  for (const candidate of imageCandidates(path)) {
    const blob = await resolveFile(candidate, dir);
    if (blob) return { blob, path: candidate };
  }
  return null;
}

async function resolveFile(
  path: string,
  dir: FileSystemDirectoryHandle | null,
): Promise<Blob | null> {
  const known = local.get(path) ?? fetched.get(path);
  if (known) return known;
  if (EXAMPLE_IMAGES.has(path)) {
    const blob = await attemptAsync(async () => {
      const response = await fetch(asset(EXAMPLE_BASE + path));
      return response.ok ? response.blob() : null;
    }, null);
    if (blob) {
      fetched.set(path, blob);
      return blob;
    }
  }
  return dir ? fromDir(dir, path) : null;
}

async function encode(
  blob: Blob,
  path: string,
): Promise<{ bytes: Uint8Array; ext: string } | null> {
  if (blob.type === "image/svg+xml" || /\.svg$/i.test(path)) {
    const pdf = await svgToPdf(new Uint8Array(await blob.arrayBuffer()));
    return pdf ? { bytes: pdf, ext: "pdf" } : null;
  }
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
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function texImageFiles(text: string): Promise<TexImages> {
  const paths = texImagePaths(text);
  const dir = paths.length || svgRefs(text).length ? await readableDir() : null;
  const names = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  for (const path of paths) {
    const found = await resolveImage(path, dir);
    const file = found ? await encode(found.blob, found.path) : null;
    if (!file) {
      missing.push(path);
      continue;
    }
    const name = "image" + String(names.size + 1) + "." + file.ext;
    names.set(path, name);
    files[name] = file.bytes;
  }
  if (!usesSvgPackage([text]))
    return { files, missing, rewrite: (tex) => rewriteIncludes(tex, names) };
  const macros = pathMacros([text]);
  const svgPath = (raw: string): string =>
    normalizeTexPath(expandMacros(raw, macros));
  const svgNames = new Map<string, string>();
  for (const raw of svgRefs(text)) {
    const path = svgPath(raw);
    if (!path || svgNames.has(path) || missing.includes(path)) continue;
    const found = await resolveSvg(path, dir);
    const pdf = found
      ? await svgToPdf(new Uint8Array(await found.blob.arrayBuffer()))
      : null;
    if (!pdf) {
      missing.push(path);
      continue;
    }
    const name = "image" + String(names.size + svgNames.size + 1) + ".pdf";
    svgNames.set(path, name);
    files[name] = pdf;
  }
  return {
    files,
    missing,
    rewrite: (tex) =>
      rewriteSvg(
        rewriteIncludes(tex, names),
        (raw) => svgNames.get(svgPath(raw)) ?? null,
        svgPath,
      ),
  };
}

const UNSAFE_PATH = /^\/|^[a-z]:|(?:^|\/)\.\.(?:\/|$)/i;
const PDFLATEX_IMAGE = /\.(?:png|jpe?g|pdf)$/i;

export async function texImageSources(text: string): Promise<TexImages> {
  const paths = texImagePaths(text);
  const macros = pathMacros([text]);
  const svgs = usesSvgPackage([text])
    ? new Set(
        svgRefs(text)
          .map((raw) => normalizeTexPath(expandMacros(raw, macros)))
          .filter(Boolean),
      )
    : new Set<string>();
  const dir = paths.length || svgs.size ? await readableDir() : null;
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  const names = new Map<string, string>();
  const bytes = async (blob: Blob): Promise<Uint8Array> =>
    new Uint8Array(await blob.arrayBuffer());
  for (const path of paths) {
    const found = await resolveImage(path, dir);
    if (
      found &&
      PDFLATEX_IMAGE.test(found.path) &&
      !UNSAFE_PATH.test(found.path)
    ) {
      files[found.path] = await bytes(found.blob);
      continue;
    }
    const file = found ? await encode(found.blob, found.path) : null;
    if (!file) {
      missing.push(path);
      continue;
    }
    let index = names.size + 1;
    while ("image" + String(index) + "." + file.ext in files) index++;
    const name = "image" + String(index) + "." + file.ext;
    names.set(path, name);
    files[name] = file.bytes;
  }
  for (const path of svgs) {
    const found = await resolveSvg(path, dir);
    if (found && !UNSAFE_PATH.test(found.path))
      files[found.path] = await bytes(found.blob);
    else if (!missing.includes(path)) missing.push(path);
  }
  return {
    files,
    missing,
    rewrite: (tex) => (names.size ? rewriteIncludes(tex, names, true) : tex),
  };
}

async function resolveSvg(
  path: string,
  dir: FileSystemDirectoryHandle | null,
): Promise<{ blob: Blob; path: string } | null> {
  for (const candidate of svgCandidates(path)) {
    const blob = await resolveFile(candidate, dir);
    if (blob) return { blob, path: candidate };
  }
  return null;
}

export async function chooseImageFolder(): Promise<void> {
  const saved = await savedDir();
  if (saved?.requestPermission) {
    const granted = await attemptAsync(
      async () =>
        (await saved.requestPermission!({ mode: "read" })) === "granted",
      false,
    );
    if (granted && (await readableDir())) {
      notify();
      return;
    }
  }
  if (window.showDirectoryPicker) {
    const dir = await attemptAsync(
      () => window.showDirectoryPicker!({ mode: "read" }),
      null,
    );
    if (dir) {
      await saveDir(dir);
      notify();
    }
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
  return [...(data?.files ?? [])].filter(
    (file) => file.type.startsWith("image/") || isHeic(file),
  );
}

export interface TexImageInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
}

export function initTexImageInput(deps: TexImageInputDeps): void {
  const { editor } = deps;

  const place = (files: File[]): void => {
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
  const insert = (files: File[]): void => {
    if (!files.some(isHeic)) return place(files);
    void Promise.all(files.map(jpegIfHeic)).then(place);
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
