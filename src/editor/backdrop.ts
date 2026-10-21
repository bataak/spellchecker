import {
  countLines,
  markedHtml,
  plainHtml,
  stripChunkNewline,
} from "./backdrophtml.ts";
import type { Token } from "../spell/textcheck.ts";
import { spansInRange, type TexSpan } from "../tex/texhighlight.ts";
import {
  caretRectAt,
  caretSpotAt,
  chunkOffsetAt,
  chunkRangeRect,
  localOffsetAtY,
  type ChunkNode,
} from "./backdropgeom.ts";

export { caretSpotAt } from "./backdropgeom.ts";

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
  setHighlighter(fn: ((text: string) => TexSpan[]) | null): void;
  text(): string;
  render(text: string, marks: Token[]): void;
  lineCount(): number;
  marksAtY(y: number): HTMLElement[];
  markAt(start: number): HTMLElement | null;
  setActiveLine(index: number): void;
  refreshMarks(): void;
  rangeRectAt(start: number, end: number): DOMRect | null;
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

function spanKey(spans: TexSpan[], start: number, end: number): string {
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
  syntax: TexSpan[],
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

export function createBackdrop(root: HTMLElement): Backdrop {
  let trailer: HTMLDivElement = document.createElement("div");
  let nodes: ChunkNode[] = [];
  let lastMarks: Token[] = [];
  let activeLine = -1;
  let activeEl: HTMLElement | null = null;
  let useBlocks = true;
  let lineTotal = 1;
  let highlighter: ((text: string) => TexSpan[]) | null = null;
  let syntax: TexSpan[] = [];
  let lastText = "";
  let topAnchor: TopAnchor | null = null;

  function reset(): void {
    root.textContent = "";
    nodes = [];
    activeLine = -1;
    activeEl = null;
    trailer = document.createElement("div");
    trailer.textContent = "​";
    root.appendChild(trailer);
  }

  function setActiveLine(index: number): void {
    activeLine = index;
    if (!useBlocks) return;
    if (activeEl) {
      activeEl.removeAttribute("data-active");
      activeEl = null;
    }
    activeEl = lineBlockAt(nodes, index);
    activeEl?.setAttribute("data-active", "true");
  }

  function syncTrailer(text: string): void {
    const need = text === "" || text.endsWith("\n");
    trailer.style.display = need ? "" : "none";
  }

  function syncChunkCount(count: number): void {
    while (nodes.length > count) nodes.pop()!.remove();
    while (nodes.length < count) {
      const div = document.createElement("div") as ChunkNode;
      div._spans = [];
      div._synKey = "";
      root.insertBefore(div, trailer);
      nodes.push(div);
    }
  }

  const marksFor = (node: ChunkNode): void =>
    applyChunkMarks(node, lastMarks, useBlocks);

  function applyVisibleMarks(): void {
    const top = root.scrollTop - VIEW_BUFFER_PX;
    const bottom = root.scrollTop + root.clientHeight + VIEW_BUFFER_PX;
    for (const node of nodes) {
      if (node.offsetTop + node.offsetHeight < top) continue;
      if (node.offsetTop > bottom) break;
      marksFor(node);
    }
  }

  function nodeAtOffset(pos: number): ChunkNode | null {
    for (const node of nodes) {
      if (pos >= node._start && pos < node._start + node._src.length) {
        return node;
      }
    }
    return null;
  }

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
      syncChunkCount(bounds.length);
      let line = 0;
      for (let i = 0; i < bounds.length; i++) {
        const node = nodes[i]!;
        node._line = line;
        updateChunkText(node, text, bounds[i]!, syntax, useBlocks);
        line += node._lines;
      }
      lineTotal = Math.max(line, 1);
      syncTrailer(text);
      activeEl = null;
      applyVisibleMarks();
      applyGutterWidth(line);
      if (activeLine >= 0) setActiveLine(activeLine);
    },
    lineCount: () => lineTotal,
    marksAtY(y) {
      const found: HTMLElement[] = [];
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        if (box.bottom < y) continue;
        if (box.top > y) break;
        marksFor(node);
        found.push(...node.querySelectorAll<HTMLElement>("mark[data-start]"));
      }
      return found;
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
    offsetAtPoint(x, y) {
      const spot = caretSpotAt(x, y);
      if (!spot) return null;
      const node = nodes.find((n) => n !== spot.node && n.contains(spot.node));
      return node ? chunkOffsetAt(node, spot, useBlocks) : null;
    },
    offsetAtY(y) {
      const node = nodes.find((n) => n.getBoundingClientRect().bottom > y);
      if (!node) return null;
      const body = stripChunkNewline(node._src);
      return (
        node._start +
        Math.min(localOffsetAtY(node, body, y, useBlocks), body.length)
      );
    },
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
