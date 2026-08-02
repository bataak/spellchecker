import { escapeHtml } from "./htmlutil.ts";
import type { Token } from "./textcheck.ts";

interface ChunkNode extends HTMLDivElement {
  _start: number;
  _src: string;
  _markKey: string | null;
  _line: number;
  _lines: number;
}

interface ChunkBound {
  start: number;
  end: number;
}

const CHUNK_TARGET = 4096;
const VIEW_BUFFER_PX = 800;

let root: HTMLElement | null = null;
let trailer: HTMLDivElement | null = null;
let nodes: ChunkNode[] = [];
let lastMarks: Token[] = [];
let activeLine = -1;
let activeEl: HTMLElement | null = null;
let useBlocks = true;

export function initBackdrop(el: HTMLElement): void {
  root = el;
  root.textContent = "";
  nodes = [];
  activeLine = -1;
  activeEl = null;
  trailer = document.createElement("div");
  trailer.textContent = "\u200b";
  root.appendChild(trailer);
}

export function renderBackdrop(text: string, marks: Token[]): void {
  lastMarks = marks;
  const bounds = splitChunks(text);
  syncChunkCount(bounds.length);
  let line = 0;
  for (let i = 0; i < bounds.length; i++) {
    const node = nodes[i]!;
    node._line = line;
    updateChunkText(node, text, bounds[i]!);
    line += node._lines;
  }
  activeEl = null;
  applyVisibleMarks();
  applyGutterWidth(line);
  if (activeLine >= 0) setActiveLine(activeLine);
}

export function setLineBlocks(on: boolean): void {
  useBlocks = on;
}

export function setActiveLine(index: number): void {
  activeLine = index;
  if (!useBlocks) return;
  if (activeEl) {
    activeEl.removeAttribute("data-active");
    activeEl = null;
  }
  for (const node of nodes) {
    if (index < node._line || index >= node._line + node._lines) continue;
    const el = node.children[index - node._line] as HTMLElement | undefined;
    if (el && el.classList.contains("bl")) {
      el.setAttribute("data-active", "true");
      activeEl = el;
    }
    return;
  }
}

function applyGutterWidth(lines: number): void {
  if (!root) return;
  const digits = String(Math.max(lines, 1)).length;
  const host = root.parentElement ?? root;
  host.style.setProperty("--gutter-digits", String(digits));
}

export function refreshBackdropMarks(): void {
  applyVisibleMarks();
}

export function materializeMark(start: number): void {
  const node = nodeAtOffset(start);
  if (node) applyChunkMarks(node);
}

function splitChunks(text: string): ChunkBound[] {
  const bounds: ChunkBound[] = [];
  let start = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const nl = text.indexOf("\n", cursor);
    cursor = nl === -1 ? text.length : nl + 1;
    if (cursor - start >= CHUNK_TARGET || cursor === text.length) {
      bounds.push({ start, end: cursor });
      start = cursor;
    }
  }
  return bounds;
}

function syncChunkCount(count: number): void {
  while (nodes.length > count) nodes.pop()!.remove();
  while (nodes.length < count) {
    const div = document.createElement("div") as ChunkNode;
    root!.insertBefore(div, trailer);
    nodes.push(div);
  }
}

function updateChunkText(
  node: ChunkNode,
  text: string,
  bound: ChunkBound,
): void {
  const raw = text.slice(bound.start, bound.end);
  node._start = bound.start;
  node._lines = countLines(raw);
  if (node._src === raw) return;
  node._src = raw;
  node._markKey = null;
  node.innerHTML = plainHtml(raw);
}

function applyVisibleMarks(): void {
  if (!root) return;
  const top = root.scrollTop - VIEW_BUFFER_PX;
  const bottom = root.scrollTop + root.clientHeight + VIEW_BUFFER_PX;
  for (const node of nodes) {
    if (node.offsetTop + node.offsetHeight < top) continue;
    if (node.offsetTop > bottom) break;
    applyChunkMarks(node);
  }
}

function applyChunkMarks(node: ChunkNode): void {
  const start = node._start;
  const slice = marksInRange(lastMarks, start, start + node._src.length);
  const key = markKey(slice);
  if (node._markKey === key) return;
  node._markKey = key;
  node.innerHTML = slice.length
    ? markedHtml(node._src, start, slice)
    : plainHtml(node._src);
}

function marksInRange(marks: Token[], start: number, end: number): Token[] {
  let lo = 0;
  let hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid]!.start < start) lo = mid + 1;
    else hi = mid;
  }
  const out: Token[] = [];
  for (let i = lo; i < marks.length && marks[i]!.start < end; i++) {
    out.push(marks[i]!);
  }
  return out;
}

function markKey(slice: Token[]): string {
  let key = "";
  for (const mark of slice) key += mark.start + ":" + mark.end + ",";
  return key;
}

export function countLines(raw: string): number {
  const body = stripChunkNewline(raw);
  let count = 1;
  for (let i = 0; i < body.length; i++) {
    if (body.charCodeAt(i) === 10) count++;
  }
  return count;
}

function hangingGuard(body: string): string {
  return body.endsWith("\n") ? "\u200b" : "";
}

export function plainHtml(raw: string): string {
  const body = stripChunkNewline(raw);

  if (!useBlocks) {
    const flat = escapeHtml(body) + hangingGuard(body);
    return flat === "" ? "\u200b" : flat;
  }

  let html = "";
  let cursor = 0;
  for (;;) {
    const nl = body.indexOf("\n", cursor);
    const end = nl === -1 ? body.length : nl;
    html += '<div class="bl">' + escapeHtml(body.slice(cursor, end)) + "</div>";
    if (nl === -1) break;
    cursor = nl + 1;
  }
  return html;
}

export function markedHtml(
  raw: string,
  chunkStart: number,
  slice: Token[],
): string {
  const body = stripChunkNewline(raw);

  if (!useBlocks) return flatMarkedHtml(body, chunkStart, slice);

  let html = "";
  let lineStart = 0;
  let index = 0;

  for (;;) {
    const nl = body.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? body.length : nl;
    let cursor = lineStart;
    html += '<div class="bl">';

    while (index < slice.length) {
      const mark = slice[index]!;
      const from = mark.start - chunkStart;
      const to = mark.end - chunkStart;
      if (from >= lineEnd) break;
      const clampedFrom = Math.max(from, cursor);
      const clampedTo = Math.min(to, lineEnd);
      if (clampedTo > clampedFrom) {
        html += escapeHtml(body.slice(cursor, clampedFrom));
        html +=
          '<mark data-start="' +
          mark.start +
          '">' +
          escapeHtml(body.slice(clampedFrom, clampedTo)) +
          "</mark>";
        cursor = clampedTo;
      }
      if (to > lineEnd) break;
      index++;
    }

    html += escapeHtml(body.slice(cursor, lineEnd)) + "</div>";
    if (nl === -1) break;
    lineStart = nl + 1;
  }

  return html;
}

function stripChunkNewline(raw: string): string {
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

function nodeAtOffset(pos: number): ChunkNode | null {
  for (const node of nodes) {
    if (pos >= node._start && pos < node._start + node._src.length) {
      return node;
    }
  }
  return null;
}

function flatMarkedHtml(
  body: string,
  chunkStart: number,
  slice: Token[],
): string {
  let html = "";
  let cursor = 0;

  for (const mark of slice) {
    const from = mark.start - chunkStart;
    const to = mark.end - chunkStart;
    html += escapeHtml(body.slice(cursor, from));
    html +=
      '<mark data-start="' +
      mark.start +
      '">' +
      escapeHtml(body.slice(from, to)) +
      "</mark>";
    cursor = to;
  }

  html += escapeHtml(body.slice(cursor)) + hangingGuard(body);
  return html === "" ? "\u200b" : html;
}
