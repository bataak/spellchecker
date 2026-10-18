import {
  compilePasses,
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
  readonly passes: number;
  readonly missing: readonly string[];
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

export interface BuildSource {
  readonly main: string | null;
  readonly texts: ReadonlyMap<string, string>;
  readonly binaries: ReadonlyMap<string, Uint8Array>;
}

export async function buildProject(s: BuildSource): Promise<ProjectBuild> {
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
  for (const dir of parentDirs(main)) dirs.add(dir);
  const put = (path: string, data: Uint8Array | string): void => {
    files[path] = data;
    for (const dir of parentDirs(path)) dirs.add(dir);
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
      const bytes = s.binaries.get(path) ?? new Uint8Array(0);
      const svg = isSvgGraphic(path);
      const data = svg ? await svgToPdf(bytes) : await toPng(bytes);
      if (!data) {
        resolved.set(raw, null);
        missing.push(wanted.trim());
        continue;
      }
      const name =
        path.replace(/\.[^./]*$/, "") +
        (svg ? ".converted.pdf" : ".converted.png");
      converted.set(path, name);
      put(name, data);
    }
  const graphic = (raw: string): string | null => {
    const path = resolved.get(raw) ?? null;
    if (path === null) return null;
    const name = converted.get(path);
    return name ? relativePath(name, root) : raw;
  };
  const svg = usesSvgPackage(s.texts.values());
  const svgs = new Map<string, string | null>();
  if (svg) {
    const svgSearch = [...s.texts.values()].flatMap(svgPaths);
    const pdfs = new Map<string, string | null>();
    for (const text of s.texts.values())
      for (const raw of svgRefs(text)) {
        if (svgs.has(raw)) continue;
        const wanted = expandMacros(raw, macros);
        const path = resolveSvg(wanted, root, [...svgSearch, ...search], has);
        if (path !== null && !pdfs.has(path)) {
          const pdf = await svgToPdf(s.binaries.get(path) ?? new Uint8Array(0));
          const name = pdf
            ? path.replace(/\.[^./]*$/, "") + ".converted.pdf"
            : null;
          if (pdf && name) put(name, pdf);
          pdfs.set(path, name);
        }
        const name = path === null ? null : (pdfs.get(path) ?? null);
        if (name === null) missing.push(wanted.trim());
        svgs.set(raw, name === null ? null : relativePath(name, root));
      }
  }
  const label = (raw: string): string => expandMacros(raw, macros).trim();
  let mainText = "";
  for (const [path, text] of s.texts) {
    const mapped = isTexSource(path) ? mapGraphics(text, graphic, label) : text;
    const body =
      svg && isTexSource(path)
        ? rewriteSvg(mapped, (raw) => svgs.get(raw) ?? null, label)
        : mapped;
    if (path === main) mainText = body;
    else put(path, body);
  }
  for (const [path, bytes] of s.binaries) put(path, bytes);
  return {
    workdir: root,
    main: rootedPath(main, root),
    mainText,
    files,
    dirs: [...dirs].sort((a, b) => a.split("/").length - b.split("/").length),
    passes: compilePasses(s.texts.values()),
    missing,
  };
}
