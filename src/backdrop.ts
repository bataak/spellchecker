import { escapeHtml } from "./htmlutil.ts";
import type { Token } from "./textcheck.ts";

interface ChunkNode extends HTMLDivElement {
  _start: number;
  _src: string;
  _markKey: string | null;
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

export function initBackdrop(el: HTMLElement): void {
  root = el;
  root.textContent = "";
  nodes = [];
  trailer = document.createElement("div");
  trailer.textContent = "\u200b";
  root.appendChild(trailer);
}

export function renderBackdrop(text: string, marks: Token[]): void {
  lastMarks = marks;
  const bounds = splitChunks(text);
  syncChunkCount(bounds.length);
  for (let i = 0; i < bounds.length; i++) {
    updateChunkText(nodes[i]!, text, bounds[i]!);
  }
  applyVisibleMarks();
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

export function plainHtml(raw: string): string {
  const body = stripChunkNewline(raw);
  const html = escapeHtml(body) + hangingGuard(body);
  return html === "" ? "\u200b" : html;
}

export function markedHtml(
  raw: string,
  chunkStart: number,
  slice: Token[],
): string {
  const body = stripChunkNewline(raw);
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

function hangingGuard(body: string): string {
  return body.endsWith("\n") ? "\u200b" : "";
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
