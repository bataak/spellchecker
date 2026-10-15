const EDITABLE = /\.(tex|ltx|sty|cls|bib|bst|bbl|cfg|def|clo|dtx|ins|txt|md)$/i;
const TEX_SOURCE = /\.(tex|ltx)$/i;
const BUILD_OUTPUT =
  /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|blg|xdv|nav|snm|vrb|bcf|run\.xml|synctex(?:\.gz)?|synctex\(busy\))$/i;
const SKIPPED_NAME = /^(?:\.|node_modules$|__MACOSX$|Thumbs\.db$)/;
const PDF_GRAPHIC = /\.(png|jpe?g|pdf)$/i;
const GRAPHIC_EXTS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".PDF",
  ".PNG",
  ".JPG",
  ".JPEG",
];
const INCLUDE =
  /\\includegraphics\s*((?:\*\s*)?(?:\[[^\]]*\]\s*)*)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const GRAPHICSPATH = /\\graphicspath\s*\{((?:\s*\{[^}]*\})*)\s*\}/g;
const CROSS_REF =
  /\\(?:tableofcontents|listof(?:figures|tables)|ref|eqref|pageref|autoref|cref|Cref|cite|label)\b/;
const BIBLIOGRAPHY = /\\(?:bibliography|addbibresource)\s*\{/;

export function isEditablePath(path: string): boolean {
  return EDITABLE.test(path);
}

export function isTexSource(path: string): boolean {
  return TEX_SOURCE.test(path);
}

const VIEWABLE: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

export function viewableType(path: string): string | null {
  const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  return VIEWABLE[ext] ?? null;
}

export function isPdfGraphic(path: string): boolean {
  return PDF_GRAPHIC.test(path);
}

export function cleanPath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

export function skippedPath(path: string): boolean {
  const parts = path.split("/");
  return (
    parts.some((part) => SKIPPED_NAME.test(part)) ||
    BUILD_OUTPUT.test(parts[parts.length - 1] ?? "")
  );
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirName(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

export function joinPath(dir: string, name: string): string {
  return dir ? dir + "/" + name : name;
}

export function validName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed !== "" &&
    trimmed !== "." &&
    trimmed !== ".." &&
    !/[/\\:*?"<>|\u0000-\u001f]/.test(trimmed)
  );
}

export function movedPath(
  path: string,
  from: string,
  to: string,
): string | null {
  if (path === from) return to;
  if (path.startsWith(from + "/")) return to + path.slice(from.length);
  return null;
}

export function within(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + "/");
}

export function parentDirs(path: string): string[] {
  const out: string[] = [];
  for (let dir = dirName(path); dir; dir = dirName(dir)) out.unshift(dir);
  return out;
}

export function commonRoot(paths: readonly string[]): string {
  if (!paths.length) return "";
  const first = paths[0]!.split("/")[0]!;
  if (!paths.every((path) => path.startsWith(first + "/"))) return "";
  return first;
}

function uncommented(text: string): string {
  return text.replace(/(?<=(?:^|[^\\])(?:\\\\)*)%.*$/gm, "");
}

export function isLatexDocument(text: string): boolean {
  const body = uncommented(text);
  return /\\documentclass\b/.test(body) && /\\begin\s*\{document\}/.test(body);
}

const TEX_MASTER = /^%+\s*TeX-master:\s*(?:"([^"]+)"|(t|nil))\s*$/m;

export function texMaster(text: string): string | null {
  const match = TEX_MASTER.exec(text);
  return match?.[1]?.trim() || null;
}

export function masterPath(file: string, master: string): string | null {
  const target = cleanPath(joinPath(dirName(file), master));
  if (!target) return null;
  return /\.[A-Za-z0-9]+$/.test(baseName(target)) ? target : target + ".tex";
}

export function findMain(texts: ReadonlyMap<string, string>): string | null {
  const named = new Map<string, number>();
  for (const [path, text] of texts) {
    const master = texMaster(text);
    const target = master === null ? null : masterPath(path, master);
    if (target) named.set(target, (named.get(target) ?? 0) + 1);
  }
  const scored: { path: string; score: number }[] = [];
  for (const [path, text] of texts) {
    if (!isTexSource(path) || !isLatexDocument(text)) continue;
    let score = 0;
    if (named.has(path)) score += 10 + (named.get(path) ?? 0);
    if (/^main\.tex$/i.test(baseName(path))) score += 2;
    score -= path.split("/").length - 1;
    scored.push({ path, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored[0]?.path ?? null;
}

export function graphicsPaths(text: string): string[] {
  const out: string[] = [];
  for (const match of uncommented(text).matchAll(GRAPHICSPATH))
    for (const dir of (match[1] ?? "").matchAll(/\{([^}]*)\}/g))
      out.push((dir[1] ?? "").trim());
  return out;
}

export function resolveGraphic(
  raw: string,
  base: string,
  searchDirs: readonly string[],
  has: (path: string) => boolean,
): string | null {
  const name = raw.trim().replace(/^"(.*)"$/, "$1");
  if (!name) return null;
  for (const dir of ["", ...searchDirs]) {
    const stem = cleanPath(joinPath(base, dir + name));
    if (!stem) continue;
    if (has(stem)) return stem;
    for (const ext of GRAPHIC_EXTS) if (has(stem + ext)) return stem + ext;
  }
  return null;
}

export function mapGraphics(
  text: string,
  map: (raw: string) => string | null,
  label: (raw: string) => string = (raw) => raw.trim(),
): string {
  return text.replace(
    INCLUDE,
    (whole, opts: string | undefined, raw: string) => {
      const target = map(raw);
      if (target === raw) return whole;
      if (target !== null)
        return "\\includegraphics" + (opts ?? "") + "{" + target + "}";
      return "\\fbox{\\ttfamily\\detokenize{" + label(raw) + "}}";
    },
  );
}

const PATH_MACRO =
  /\\(?:def|(?:re|provide)?newcommand\*?)\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*\{([^{}]*)\}/g;
const MACRO_USE = /\\([A-Za-z@]+)\s*(?:\{\})?/g;

export function pathMacros(texts: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const text of texts)
    for (const match of uncommented(text).matchAll(PATH_MACRO))
      out.set(match[1]!, match[2]!.trim());
  return out;
}

export function expandMacros(
  raw: string,
  macros: ReadonlyMap<string, string>,
): string {
  let out = raw;
  for (let depth = 0; depth < 8; depth += 1) {
    const next = out.replace(
      MACRO_USE,
      (whole, name: string) => macros.get(name) ?? whole,
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

export function graphicRefs(text: string): string[] {
  return [...uncommented(text).matchAll(INCLUDE)].map(
    (match) => match[2] ?? "",
  );
}

const FILE_REFERENCE =
  /\\(?:input|include|subfile|import|subimport|includegraphics|bibliography|addbibresource|lstinputlisting|verbatiminput)\b\*?\s*(?:\[[^\]]*\]\s*)*\{/;

export function referencesFiles(text: string): boolean {
  return FILE_REFERENCE.test(uncommented(text));
}

export function compilePasses(texts: Iterable<string>): number {
  let passes = 1;
  for (const text of texts) {
    const body = uncommented(text);
    if (BIBLIOGRAPHY.test(body)) return 3;
    if (CROSS_REF.test(body)) passes = 2;
  }
  return passes;
}

export function relativePath(path: string, from: string): string {
  const up = from ? from.split("/") : [];
  const down = path.split("/");
  let same = 0;
  while (same < up.length && same < down.length - 1 && up[same] === down[same])
    same += 1;
  return [...up.slice(same).map(() => ".."), ...down.slice(same)].join("/");
}

export function rootedPath(path: string, root: string): string {
  return root && path.startsWith(root + "/")
    ? path.slice(root.length + 1)
    : path;
}

export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly dir: boolean;
  readonly children: TreeNode[];
}

export function buildTree(
  files: Iterable<string>,
  dirs: Iterable<string>,
): TreeNode[] {
  const root: TreeNode = { path: "", name: "", dir: true, children: [] };
  const nodes = new Map<string, TreeNode>([["", root]]);
  const ensureDir = (path: string): TreeNode => {
    const known = nodes.get(path);
    if (known) return known;
    const parent = ensureDir(dirName(path));
    const node: TreeNode = {
      path,
      name: baseName(path),
      dir: true,
      children: [],
    };
    parent.children.push(node);
    nodes.set(path, node);
    return node;
  };
  for (const dir of dirs) ensureDir(dir);
  for (const path of files) {
    const parent = ensureDir(dirName(path));
    parent.children.push({
      path,
      name: baseName(path),
      dir: false,
      children: [],
    });
  }
  const sort = (node: TreeNode): void => {
    node.children.sort(
      (a, b) =>
        Number(b.dir) - Number(a.dir) ||
        a.name.localeCompare(b.name, "mn", { numeric: true }),
    );
    for (const child of node.children) if (child.dir) sort(child);
  };
  sort(root);
  return root.children;
}
