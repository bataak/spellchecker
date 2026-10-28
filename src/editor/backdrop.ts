import {
  countLines,
  markedHtml,
  plainHtml,
  stripChunkNewline,
} from "./backdrophtml.ts";
import type { Token } from "../spell/textcheck.ts";
import { createEmitter } from "../core/emitter.ts";
import {
  spansInRange,
  type Highlighter,
  type SyntaxSpan,
} from "./syntaxspans.ts";
import {
  caretRectAt,
  chunkRangeRect,
  chunkRangeRects,
  localOffsetAtPoint,
  localOffsetAtY,
  type ChunkNode,
} from "./backdropgeom.ts";

interface ChunkBound {
  start: number;
  end: number;
}

interface TopAnchor {
  offset: number;
  delta: number;
}

const CHUNK_TARGET = 4096;
const VIEW_BUFFER_PX = 800;

export interface Backdrop {
  readonly el: HTMLElement;
  reset(): void;
  setLineBlocks(on: boolean): void;
  setHighlighter(fn: Highlighter | null): void;
  text(): string;
  render(text: string, marks: Token[]): void;
  onRender(listener: () => void): () => void;
  lineCount(): number;
  marksAtY(y: number): HTMLElement[];
  markAt(start: number): HTMLElement | null;
  setActiveLine(index: number): void;
  refreshMarks(): void;
  rangeRectAt(start: number, end: number): DOMRect | null;
  caretRect(offset: number): DOMRect | null;
  rangeRects(start: number, end: number): DOMRect[];
  offsetAtPoint(x: number, y: number): number | null;
  offsetAtY(y: number): number | null;
  captureTopAnchor(): void;
  anchoredScrollTop(): number | null;
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

function spanKey(spans: SyntaxSpan[], start: number, end: number): string {
  let key = "";
  for (const span of spans) {
    key +=
      span.kind +
      (Math.max(span.start, start) - start) +
      ":" +
      (Math.min(span.end, end) - start) +
      ",";
  }
  return key;
}

function markKey(slice: Token[]): string {
  let key = "";
  for (const mark of slice) key += mark.start + ":" + mark.end + ",";
  return key;
}

function applyGutterWidth(lines: number): void {
  const digits = Math.max(2, String(Math.max(lines, 1)).length);
  document.documentElement.style.setProperty("--gutter-digits", String(digits));
}

function updateChunkText(
  node: ChunkNode,
  text: string,
  bound: ChunkBound,
  syntax: SyntaxSpan[],
  blocks: boolean,
): void {
  const raw = text.slice(bound.start, bound.end);
  node._start = bound.start;
  node._lines = countLines(raw);
  const spans = syntax.length
    ? spansInRange(syntax, bound.start, bound.end)
    : [];
  const synKey = spanKey(spans, bound.start, bound.end);
  if (node._src === raw && node._synKey === synKey) {
    node._spans = spans;
    return;
  }
  node._src = raw;
  node._spans = spans;
  node._synKey = synKey;
  node._markKey = "";
  node.innerHTML = plainHtml(raw, bound.start, spans, blocks);
}

function applyChunkMarks(
  node: ChunkNode,
  marks: Token[],
  blocks: boolean,
): void {
  const start = node._start;
  const slice = marksInRange(marks, start, start + node._src.length);
  const key = markKey(slice);
  if (node._markKey === key) return;
  node._markKey = key;
  node.innerHTML = slice.length
    ? markedHtml(node._src, start, slice, node._spans, blocks)
    : plainHtml(node._src, start, node._spans, blocks);
}

function lineBlockAt(
  nodes: readonly ChunkNode[],
  index: number,
): HTMLElement | null {
  const node = nodes.find(
    (n) => index >= n._line && index < n._line + n._lines,
  );
  const el = node?.children[index - node._line] as HTMLElement | undefined;
  return el && el.classList.contains("bl") ? el : null;
}

function topAnchorOf(
  root: HTMLElement,
  nodes: readonly ChunkNode[],
  blocks: boolean,
): TopAnchor | null {
  if (root.scrollTop <= 0) return null;
  const node = nodes.find((n) => n.offsetTop + n.offsetHeight > root.scrollTop);
  if (!node) return null;
  const body = stripChunkNewline(node._src);
  const y0 = root.getBoundingClientRect().top + root.clientTop;
  const lo = localOffsetAtY(node, body, y0, blocks);
  return {
    offset: node._start + lo,
    delta: caretRectAt(node, body, lo, blocks).top - y0,
  };
}

function anchoredTop(
  root: HTMLElement,
  node: ChunkNode,
  anchor: TopAnchor,
  blocks: boolean,
): number {
  const body = stripChunkNewline(node._src);
  const local = Math.min(anchor.offset - node._start, body.length);
  const viewTop = root.getBoundingClientRect().top + root.clientTop;
  const top = caretRectAt(node, body, local, blocks).top - viewTop;
  return Math.max(0, root.scrollTop + top - anchor.delta);
}

function newTrailer(): HTMLDivElement {
  const trailer = document.createElement("div");
  trailer.textContent = "​";
  return trailer;
}

function syncChunkCount(
  root: HTMLElement,
  nodes: ChunkNode[],
  trailer: HTMLElement,
  count: number,
): void {
  while (nodes.length > count) nodes.pop()!.remove();
  while (nodes.length < count) {
    const div = document.createElement("div") as ChunkNode;
    div._spans = [];
    div._synKey = "";
    root.insertBefore(div, trailer);
    nodes.push(div);
  }
}

function renderChunks(
  nodes: readonly ChunkNode[],
  text: string,
  bounds: ReturnType<typeof splitChunks>,
  syntax: SyntaxSpan[],
  blocks: boolean,
): number {
  let line = 0;
  for (let i = 0; i < bounds.length; i++) {
    const node = nodes[i]!;
    node._line = line;
    updateChunkText(node, text, bounds[i]!, syntax, blocks);
    line += node._lines;
  }
  return line;
}

function visibleNodes(
  root: HTMLElement,
  nodes: readonly ChunkNode[],
): ChunkNode[] {
  const top = root.scrollTop - VIEW_BUFFER_PX;
  const bottom = root.scrollTop + root.clientHeight + VIEW_BUFFER_PX;
  const out: ChunkNode[] = [];
  for (const node of nodes) {
    if (node.offsetTop + node.offsetHeight < top) continue;
    if (node.offsetTop > bottom) break;
    out.push(node);
  }
  return out;
}

function nodesAtY(nodes: readonly ChunkNode[], y: number): ChunkNode[] {
  const out: ChunkNode[] = [];
  for (const node of nodes) {
    const box = node.getBoundingClientRect();
    if (box.bottom < y) continue;
    if (box.top > y) break;
    out.push(node);
  }
  return out;
}

function nodeAt(nodes: readonly ChunkNode[], pos: number): ChunkNode | null {
  return (
    nodes.find(
      (node) => pos >= node._start && pos < node._start + node._src.length,
    ) ?? null
  );
}

function nodeAtY(nodes: readonly ChunkNode[], y: number): ChunkNode | null {
  return nodes.find((n) => n.getBoundingClientRect().bottom > y) ?? null;
}

function offsetAtYIn(
  nodes: readonly ChunkNode[],
  y: number,
  blocks: boolean,
): number | null {
  const node = nodeAtY(nodes, y);
  if (!node) return null;
  const body = stripChunkNewline(node._src);
  return (
    node._start + Math.min(localOffsetAtY(node, body, y, blocks), body.length)
  );
}

function offsetAtPointIn(
  nodes: readonly ChunkNode[],
  x: number,
  y: number,
  blocks: boolean,
): number | null {
  const node = nodeAtY(nodes, y);
  if (!node) return null;
  const body = stripChunkNewline(node._src);
  return node._start + localOffsetAtPoint(node, body, x, y, blocks);
}

function caretRectIn(
  nodes: readonly ChunkNode[],
  offset: number,
  blocks: boolean,
): DOMRect | null {
  const node =
    nodeAt(nodes, offset) ?? (offset > 0 ? nodeAt(nodes, offset - 1) : null);
  if (!node) return null;
  const body = stripChunkNewline(node._src);
  const local = Math.min(Math.max(0, offset - node._start), body.length);
  return caretRectAt(node, body, local, blocks);
}

function rangeRectsIn(
  nodes: readonly ChunkNode[],
  start: number,
  end: number,
  blocks: boolean,
): DOMRect[] {
  const out: DOMRect[] = [];
  for (const node of nodes) {
    if (node._start >= end) break;
    if (node._start + node._src.length <= start) continue;
    out.push(...chunkRangeRects(node, start, end, blocks));
  }
  return out;
}

export function createBackdrop(root: HTMLElement): Backdrop {
  let trailer: HTMLDivElement = document.createElement("div");
  let nodes: ChunkNode[] = [];
  let lastMarks: Token[] = [];
  let activeLine = -1;
  let activeEl: HTMLElement | null = null;
  let useBlocks = true;
  let lineTotal = 1;
  let highlighter: Highlighter | null = null;
  let syntax: SyntaxSpan[] = [];
  let lastText = "";
  let topAnchor: TopAnchor | null = null;
  const rendered = createEmitter();

  function reset(): void {
    root.textContent = "";
    nodes = [];
    activeLine = -1;
    activeEl = null;
    trailer = root.appendChild(newTrailer());
  }

  function setActiveLine(index: number): void {
    activeLine = index;
    if (!useBlocks) return;
    activeEl?.removeAttribute("data-active");
    activeEl = lineBlockAt(nodes, index);
    activeEl?.setAttribute("data-active", "true");
  }

  const marksFor = (node: ChunkNode): void =>
    applyChunkMarks(node, lastMarks, useBlocks);

  const applyVisibleMarks = (): void =>
    visibleNodes(root, nodes).forEach(marksFor);
  const nodeAtOffset = (pos: number): ChunkNode | null => nodeAt(nodes, pos);

  reset();

  return {
    el: root,
    reset,
    setLineBlocks(on) {
      useBlocks = on;
    },
    setHighlighter(fn) {
      if (fn === highlighter) return;
      highlighter = fn;
      for (const node of nodes) node._src = "";
    },
    text: () => lastText,
    render(text, marks) {
      lastMarks = marks;
      lastText = text;
      syntax = highlighter ? highlighter(text) : [];
      const bounds = splitChunks(text);
      syncChunkCount(root, nodes, trailer, bounds.length);
      const line = renderChunks(nodes, text, bounds, syntax, useBlocks);
      lineTotal = Math.max(line, 1);
      trailer.style.display = text === "" || text.endsWith("\n") ? "" : "none";
      activeEl = null;
      applyVisibleMarks();
      applyGutterWidth(line);
      if (activeLine >= 0) setActiveLine(activeLine);
      rendered.emit();
    },
    onRender: rendered.on,
    lineCount: () => lineTotal,
    marksAtY(y) {
      return nodesAtY(nodes, y).flatMap((node) => {
        marksFor(node);
        return [...node.querySelectorAll<HTMLElement>("mark[data-start]")];
      });
    },
    markAt(start) {
      const node = nodeAtOffset(start);
      if (node) marksFor(node);
      return root.querySelector<HTMLElement>(
        'mark[data-start="' + start + '"]',
      );
    },
    setActiveLine,
    refreshMarks: applyVisibleMarks,
    rangeRectAt(start, end) {
      if (end <= start) return null;
      const node = nodeAtOffset(start);
      if (!node) return null;
      marksFor(node);
      return chunkRangeRect(node, start, end, useBlocks);
    },
    caretRect: (offset) => caretRectIn(nodes, offset, useBlocks),
    rangeRects: (start, end) => rangeRectsIn(nodes, start, end, useBlocks),
    offsetAtPoint: (x, y) => offsetAtPointIn(nodes, x, y, useBlocks),
    offsetAtY: (y) => offsetAtYIn(nodes, y, useBlocks),
    captureTopAnchor() {
      topAnchor = topAnchorOf(root, nodes, useBlocks);
    },
    anchoredScrollTop() {
      if (!topAnchor) return null;
      const node = nodeAtOffset(topAnchor.offset);
      return node ? anchoredTop(root, node, topAnchor, useBlocks) : null;
    },
  };
}
