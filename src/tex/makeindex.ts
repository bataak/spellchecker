import { compareMongolian, letterGroup } from "./mncollate.ts";
import { decodeTexBytes } from "./texbytes.ts";

interface Level {
  readonly sort: string;
  readonly text: string;
}

type RangeMark = "open" | "close" | null;

interface PageRef {
  readonly page: string;
  readonly encap: string;
  readonly range: RangeMark;
}

export interface IndexEntry {
  readonly levels: readonly Level[];
  readonly ref: PageRef;
}

interface Node {
  readonly level: Level;
  readonly refs: PageRef[];
  readonly children: Map<string, Node>;
}

const QUOTE = '"';
const LEVEL = "!";
const ACTUAL = "@";
const ENCAP = "|";
const MAX_LEVELS = 3;
const IMPLICIT_RANGE = 3;
const ITEMS = ["\\item ", "\\subitem ", "\\subsubitem "];
const INDENT = ["  ", "    ", "      "];

function readGroup(text: string, from: number): [string, number] | null {
  if (text[from] !== "{") return null;
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") at += 1;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0)
      return [text.slice(from + 1, at), at + 1];
  }
  return null;
}

function splitUnquoted(text: string, mark: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === QUOTE) at += 1;
    else if (text[at] === mark) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function unquote(text: string): string {
  return text.replace(/"(.)/g, "$1");
}

function readLevel(raw: string): Level {
  const [sort, ...rest] = splitUnquoted(raw, ACTUAL);
  const text = rest.length ? rest.join(ACTUAL) : sort!;
  return { sort: unquote(sort!).trim(), text: unquote(text).trim() };
}

function readEncap(raw: string): { encap: string; range: RangeMark } {
  if (raw.startsWith("(")) return { encap: raw.slice(1), range: "open" };
  if (raw.startsWith(")")) return { encap: raw.slice(1), range: "close" };
  return { encap: raw, range: null };
}

export function parseEntry(key: string, page: string): IndexEntry | null {
  const [body, ...encaps] = splitUnquoted(key, ENCAP);
  const levels = splitUnquoted(body!, LEVEL)
    .slice(0, MAX_LEVELS)
    .map(readLevel);
  if (!levels.length || levels.some((level) => !level.sort)) return null;
  const { encap, range } = readEncap(unquote(encaps.join(ENCAP)));
  return { levels, ref: { page: page.trim(), encap, range } };
}

export function parseIdx(idx: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const marker = "\\indexentry";
  for (let at = idx.indexOf(marker); at >= 0; at = idx.indexOf(marker, at)) {
    at += marker.length;
    const key = readGroup(idx, at);
    const page = key && readGroup(idx, key[1]);
    if (!key || !page) continue;
    const entry = parseEntry(key[0], page[0]);
    if (entry) entries.push(entry);
    at = page[1];
  }
  return entries;
}

function nodeKey(level: Level): string {
  return level.sort + "\u0000" + level.text;
}

function buildTree(entries: readonly IndexEntry[]): Map<string, Node> {
  const root = new Map<string, Node>();
  for (const { levels, ref } of entries) {
    let siblings = root;
    let node: Node | undefined;
    for (const level of levels) {
      const key = nodeKey(level);
      node = siblings.get(key);
      if (!node) {
        node = { level, refs: [], children: new Map() };
        siblings.set(key, node);
      }
      siblings = node.children;
    }
    node!.refs.push(ref);
  }
  return root;
}

function compareNodes(a: Node, b: Node): number {
  return (
    compareMongolian(a.level.sort, b.level.sort) ||
    compareMongolian(a.level.text, b.level.text)
  );
}

const ROMAN: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

function romanValue(page: string): number | null {
  const digits = [...page.toLowerCase()].map((char) => ROMAN[char]);
  if (!digits.length || digits.some((value) => value === undefined))
    return null;
  let total = 0;
  digits.forEach((value, at) => {
    const next = digits[at + 1] ?? 0;
    total += value! < next ? -value! : value!;
  });
  return total;
}

function pageValue(page: string): [number, number] {
  if (/^\d+$/.test(page)) return [1, Number(page)];
  const roman = romanValue(page);
  return roman === null ? [2, 0] : [0, roman];
}

function comparePages(a: PageRef, b: PageRef): number {
  const [x, y] = [pageValue(a.page), pageValue(b.page)];
  return x[0] - y[0] || x[1] - y[1] || compareMongolian(a.page, b.page);
}

function wrap(encap: string, page: string): string {
  return encap ? "\\" + encap + "{" + page + "}" : page;
}

function successive(a: PageRef, b: PageRef): boolean {
  const [x, y] = [pageValue(a.page), pageValue(b.page)];
  return x[0] === y[0] && x[0] < 2 && y[1] === x[1] + 1;
}

type Run =
  | { readonly kind: "span"; readonly text: string }
  | { readonly kind: "page"; readonly ref: PageRef };

function explicitRanges(refs: readonly PageRef[]): Run[] {
  const runs: Run[] = [];
  let open: PageRef | null = null;
  for (const ref of refs) {
    if (ref.range === "open") open ??= ref;
    else if (ref.range === "close" && open) {
      const span =
        open.page === ref.page ? open.page : open.page + "--" + ref.page;
      runs.push({ kind: "span", text: wrap(open.encap, span) });
      open = null;
    } else if (!open) runs.push({ kind: "page", ref });
  }
  if (open) runs.push({ kind: "span", text: wrap(open.encap, open.page) });
  return runs;
}

function implicitRanges(pages: readonly PageRef[]): string[] {
  const out: string[] = [];
  for (let at = 0; at < pages.length;) {
    let end = at;
    while (
      end + 1 < pages.length &&
      pages[end + 1]!.encap === pages[at]!.encap &&
      successive(pages[end]!, pages[end + 1]!)
    )
      end += 1;
    const first = pages[at]!;
    if (end - at + 1 >= IMPLICIT_RANGE) {
      out.push(wrap(first.encap, first.page + "--" + pages[end]!.page));
    } else {
      for (let i = at; i <= end; i += 1)
        out.push(wrap(pages[i]!.encap, pages[i]!.page));
    }
    at = end + 1;
  }
  return out;
}

function pageList(refs: readonly PageRef[]): string[] {
  const sorted = [...refs].sort(comparePages);
  const seen = new Set<string>();
  const unique = sorted.filter((ref) => {
    const key = ref.page + "|" + ref.encap + "|" + ref.range;
    return !seen.has(key) && seen.add(key);
  });
  const out: string[] = [];
  let plain: PageRef[] = [];
  const flush = (): void => {
    out.push(...implicitRanges(plain));
    plain = [];
  };
  for (const run of explicitRanges(unique)) {
    if (run.kind === "page") plain.push(run.ref);
    else {
      flush();
      out.push(run.text);
    }
  }
  flush();
  return out;
}

function renderNode(node: Node, depth: number, lines: string[]): void {
  const pages = pageList(node.refs);
  const text = node.level.text + (pages.length ? ", " + pages.join(", ") : "");
  lines.push(INDENT[depth] + ITEMS[depth] + text);
  const children = [...node.children.values()].sort(compareNodes);
  for (const child of children) renderNode(child, depth + 1, lines);
}

export function renderIndex(entries: readonly IndexEntry[]): string {
  const nodes = [...buildTree(entries).values()].sort(compareNodes);
  const lines: string[] = ["\\begin{theindex}"];
  let group: string | null = null;
  for (const node of nodes) {
    const next = letterGroup(node.level.sort);
    if (group !== null && next !== group) lines.push("", "  \\indexspace");
    if (next !== group) lines.push("");
    group = next;
    renderNode(node, 0, lines);
  }
  lines.push("", "\\end{theindex}", "");
  return lines.join("\n");
}

export function makeIndex(idx: string): string {
  return renderIndex(parseIdx(decodeTexBytes(idx)));
}
