import { pageList, type PageRef, type RangeMark } from "./indexpages.ts";
import { compareMongolian, letterGroup } from "./mncollate.ts";
import { decodeTexBytes } from "./texbytes.ts";

interface Level {
  readonly sort: string;
  readonly text: string;
}

type Levels = readonly [Level, ...Level[]];

export interface IndexEntry {
  readonly levels: Levels;
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
const KEY_SEPARATOR = "\u0000";
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
  const [first, ...rest] = splitUnquoted(body!, LEVEL)
    .slice(0, MAX_LEVELS)
    .map(readLevel);
  const levels: Levels | null = first ? [first, ...rest] : null;
  if (!levels || levels.some((level) => !level.sort)) return null;
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
  return level.sort + KEY_SEPARATOR + level.text;
}

function childAt(siblings: Map<string, Node>, level: Level): Node {
  const key = nodeKey(level);
  let node = siblings.get(key);
  if (!node) {
    node = { level, refs: [], children: new Map() };
    siblings.set(key, node);
  }
  return node;
}

function buildTree(entries: readonly IndexEntry[]): Map<string, Node> {
  const root = new Map<string, Node>();
  for (const { levels, ref } of entries) {
    const [first, ...rest] = levels;
    let node = childAt(root, first);
    for (const level of rest) node = childAt(node.children, level);
    node.refs.push(ref);
  }
  return root;
}

function compareNodes(a: Node, b: Node): number {
  return (
    compareMongolian(a.level.sort, b.level.sort) ||
    compareMongolian(a.level.text, b.level.text)
  );
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
