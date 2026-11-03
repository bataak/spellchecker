import { TexSource } from "./texsource.ts";
import {
  INCLUDE_GRAPHICS,
  expandMacros,
  GRAPHIC_EXTS,
  pathMacros,
  runtimePath,
} from "./texproject.ts";
import {
  rewriteSvg,
  svgCandidates,
  svgRefs,
  svgToPdf,
  usesSvgPackage,
} from "./texsvg.ts";
import { noteError } from "../core/errorlog.ts";
import { attemptAsync } from "../core/attempt.ts";
import { fromDir, readableDir, savedDir, saveDir } from "./teximagedir.ts";

const EXAMPLE_BASE = "examples/";

const EXAMPLE_IMAGES: ReadonlySet<string> = new Set([
  "img/transformer-model-architecture.png",
  "img/scaled-dot-product-attention.png",
  "img/multi-head-attention.png",
]);

const DIRECT_TYPES = new Set(["image/png", "image/jpeg"]);

const UNSAFE_PATH = /^\/|^[a-z]:|(?:^|\/)\.\.(?:\/|$)/i;

const PDFLATEX_IMAGE = /\.(?:png|jpe?g|pdf)$/i;

const BRACE_ARGUMENT = /\{([^{}\\#]+)\}/g;

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
  for (const match of TexSource.of(text).matches(INCLUDE_GRAPHICS)) {
    const path = normalizeTexPath(expandMacros(match[2] ?? "", macros));
    if (path && !runtimePath(path)) out.add(path);
  }
  return [...out];
}

export function rewriteIncludes(
  text: string,
  names: ReadonlyMap<string, string>,
  keep = false,
): string {
  const macros = pathMacros([text]);
  return TexSource.of(text).replace(
    INCLUDE_GRAPHICS,
    (match, opts, raw = "") => {
      const path = normalizeTexPath(expandMacros(raw, macros));
      const name = names.get(path);
      if (name) return "\\includegraphics" + (opts ?? "") + "{" + name + "}";
      if (keep) return match;
      const box = "\\fbox{\\ttfamily\\detokenize{" + path + "}}";
      if (!runtimePath(path)) return box;
      const include = "\\includegraphics" + (opts ?? "") + "{" + path + "}";
      return "\\IfFileExists{" + path + "}{" + include + "}{" + box + "}";
    },
  );
}

export const local = new Map<string, Blob>();

const fetched = new Map<string, Blob>();

const listeners = new Set<() => void>();

export function notify(): void {
  for (const listener of listeners) listener();
}

export function onTexImagesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function asset(path: string): string {
  return import.meta.env.BASE_URL + path;
}

export function imageCandidates(path: string): string[] {
  return /\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1))
    ? [path]
    : [path, ...GRAPHIC_EXTS.map((ext) => path + ext)];
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
  if (blob.type === "application/pdf" || /\.pdf$/i.test(path))
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: "pdf" };
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

export function runtimeImagePaths(text: string): string[] {
  const macros = pathMacros([text]);
  const dynamic = TexSource.of(text)
    .matches(INCLUDE_GRAPHICS)
    .some((match) => runtimePath(expandMacros(match[2] ?? "", macros)));
  if (!dynamic) return [];
  const out = new Set<string>();
  for (const match of TexSource.of(text).matches(BRACE_ARGUMENT))
    for (const part of match[1]!.split(",")) {
      const path = normalizeTexPath(part);
      if (PDFLATEX_IMAGE.test(path) && !UNSAFE_PATH.test(path)) out.add(path);
    }
  return [...out];
}

async function addRuntimeImages(
  paths: readonly string[],
  dir: FileSystemDirectoryHandle | null,
  files: Record<string, Uint8Array>,
): Promise<void> {
  for (const path of paths) {
    const blob = await resolveFile(path, dir);
    if (blob) files[path] = new Uint8Array(await blob.arrayBuffer());
  }
}

export async function texImageFiles(text: string): Promise<TexImages> {
  const paths = texImagePaths(text);
  const runtime = runtimeImagePaths(text);
  const dir =
    paths.length || runtime.length || svgRefs(text).length
      ? await readableDir()
      : null;
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
  await addRuntimeImages(runtime, dir, files);
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

function svgImagePaths(text: string): Set<string> {
  if (!usesSvgPackage([text])) return new Set();
  const macros = pathMacros([text]);
  return new Set(
    svgRefs(text)
      .map((raw) => normalizeTexPath(expandMacros(raw, macros)))
      .filter(Boolean),
  );
}

export async function texImageSources(text: string): Promise<TexImages> {
  const paths = texImagePaths(text);
  const svgs = svgImagePaths(text);
  const runtime = runtimeImagePaths(text);
  const dir =
    paths.length || runtime.length || svgs.size ? await readableDir() : null;
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
  await addRuntimeImages(runtime, dir, files);
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

function blobStamp(path: string, blob: Blob): string {
  const changed = blob instanceof File ? blob.lastModified : 0;
  return [path, blob.size, changed].join("\u0000");
}

export async function imageStamp(text: string): Promise<string | null> {
  const paths = texImagePaths(text);
  const svgs = svgImagePaths(text);
  if (!paths.length && !svgs.size) return "";
  const dir = await readableDir();
  const parts: string[] = [];
  for (const path of paths) {
    const found = await resolveImage(path, dir);
    if (!found) return null;
    parts.push(blobStamp(found.path, found.blob));
  }
  for (const path of svgs) {
    const found = await resolveSvg(path, dir);
    if (!found) return null;
    parts.push(blobStamp(found.path, found.blob));
  }
  return parts.join("\n");
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
