import { pathRecord } from "../core/pathrecord.ts";
import { noteError } from "../core/errorlog.ts";
import {
  dirName,
  expandMacros,
  graphicRefs,
  graphicsPaths,
  isPdfGraphic,
  isSvgGraphic,
  isTexSource,
  mapGraphics,
  parentDirs,
  pathMacros,
  relativePath,
  resolveGraphic,
  rootedPath,
} from "../tex/texproject.ts";
import {
  resolveSvg,
  rewriteSvg,
  svgPaths,
  svgRefs,
  svgToPdf,
  usesSvgPackage,
} from "../tex/texsvg.ts";
import { ProjectError } from "./projecterror.ts";

export interface ProjectBuild {
  readonly workdir: string;
  readonly main: string;
  readonly mainText: string;
  readonly files: Record<string, Uint8Array | string>;
  readonly dirs: readonly string[];
  readonly missing: readonly string[];
}

export interface TexProject {
  build(): Promise<ProjectBuild>;
  digest(): Promise<string | null>;
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
  } catch (error) {
    noteError(error);
    return null;
  }
}

export interface Converters {
  readonly raster: (bytes: Uint8Array) => Promise<Uint8Array | null>;
  readonly svg: (bytes: Uint8Array) => Promise<Uint8Array | null>;
}

const CONVERTERS: Converters = { raster: toPng, svg: svgToPdf };

export interface BuildSource {
  readonly main: string | null;
  readonly texts: ReadonlyMap<string, string>;
  readonly binaries: ReadonlyMap<string, Uint8Array>;
}

interface Build {
  readonly s: BuildSource;
  readonly convert: Converters;
  readonly root: string;
  readonly has: (path: string) => boolean;
  readonly search: readonly string[];
  readonly macros: ReadonlyMap<string, string>;
  readonly missing: string[];
  readonly files: Record<string, Uint8Array | string>;
  readonly dirs: Set<string>;
}

function put(b: Build, path: string, data: Uint8Array | string): void {
  b.files[path] = data;
  for (const dir of parentDirs(path)) b.dirs.add(dir);
}

const convertedName = (path: string, ext: string): string =>
  path.replace(/\.[^./]*$/, "") + ".converted." + ext;

const bytesOf = (b: Build, path: string): Uint8Array =>
  b.s.binaries.get(path) ?? new Uint8Array(0);

async function convertGraphic(b: Build, path: string): Promise<string | null> {
  const svg = isSvgGraphic(path);
  const bytes = bytesOf(b, path);
  const data = svg ? await b.convert.svg(bytes) : await b.convert.raster(bytes);
  if (!data) return null;
  const name = convertedName(path, svg ? "pdf" : "png");
  put(b, name, data);
  return name;
}

async function collectGraphics(
  b: Build,
): Promise<(raw: string) => string | null> {
  const resolved = new Map<string, string | null>();
  const converted = new Map<string, string>();
  for (const text of b.s.texts.values())
    for (const raw of graphicRefs(text)) {
      if (resolved.has(raw)) continue;
      const wanted = expandMacros(raw, b.macros);
      let path = resolveGraphic(wanted, b.root, b.search, b.has);
      if (path !== null && !isPdfGraphic(path) && !converted.has(path)) {
        const name = await convertGraphic(b, path);
        if (name === null) path = null;
        else converted.set(path, name);
      }
      resolved.set(raw, path);
      if (path === null) b.missing.push(wanted.trim());
    }
  return (raw) => {
    const path = resolved.get(raw) ?? null;
    if (path === null) return null;
    const name = converted.get(path);
    return name ? relativePath(name, b.root) : raw;
  };
}

async function collectSvgs(b: Build): Promise<(raw: string) => string | null> {
  const svgs = new Map<string, string | null>();
  const pdfs = new Map<string, string | null>();
  const search = [...[...b.s.texts.values()].flatMap(svgPaths), ...b.search];
  for (const text of b.s.texts.values())
    for (const raw of svgRefs(text)) {
      if (svgs.has(raw)) continue;
      const wanted = expandMacros(raw, b.macros);
      const path = resolveSvg(wanted, b.root, search, b.has);
      if (path !== null && !pdfs.has(path)) {
        const pdf = await b.convert.svg(bytesOf(b, path));
        const name = pdf ? convertedName(path, "pdf") : null;
        if (pdf && name) put(b, name, pdf);
        pdfs.set(path, name);
      }
      const name = path === null ? null : (pdfs.get(path) ?? null);
      if (name === null) b.missing.push(wanted.trim());
      svgs.set(raw, name === null ? null : relativePath(name, b.root));
    }
  return (raw) => svgs.get(raw) ?? null;
}

function writeSources(
  b: Build,
  main: string,
  graphic: (raw: string) => string | null,
  svg: ((raw: string) => string | null) | null,
): string {
  const label = (raw: string): string => expandMacros(raw, b.macros).trim();
  let mainText = "";
  for (const [path, text] of b.s.texts) {
    let body = text;
    if (isTexSource(path)) {
      body = mapGraphics(text, graphic, label);
      if (svg) body = rewriteSvg(body, svg, label);
    }
    if (path === main) mainText = body;
    else put(b, path, body);
  }
  return mainText;
}

export async function buildProject(
  s: BuildSource,
  convert: Converters = CONVERTERS,
): Promise<ProjectBuild> {
  const main = s.main;
  if (!main)
    throw new ProjectError("Төслийн үндсэн .tex файл тодорхойгүй байна");
  const root = dirName(main);
  const b: Build = {
    s,
    convert,
    root,
    has: (path) => s.binaries.has(path) || s.texts.has(path),
    search: [...s.texts.values()].flatMap(graphicsPaths),
    macros: pathMacros(s.texts.values()),
    missing: [],
    files: pathRecord(),
    dirs: new Set(parentDirs(main)),
  };
  const graphic = await collectGraphics(b);
  const svg = usesSvgPackage(s.texts.values()) ? await collectSvgs(b) : null;
  const mainText = writeSources(b, main, graphic, svg);
  for (const [path, bytes] of s.binaries) put(b, path, bytes);
  return {
    workdir: root,
    main: rootedPath(main, root),
    mainText,
    files: b.files,
    dirs: [...b.dirs].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    ),
    missing: b.missing,
  };
}
