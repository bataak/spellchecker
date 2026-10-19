import {
  countLines,
  markedHtml,
  plainHtml,
  stripChunkNewline,
} from "./backdrophtml.ts";
import type { Token } from "../spell/textcheck.ts";
import { spansInRange, type TexSpan } from "../tex/texhighlight.ts";

interface ChunkNode extends HTMLDivElement {
  _start: number;
  _src: string;
  _markKey: string | null;
  _spans: TexSpan[];
  _synKey: string;
  _line: number;
  _lines: number;
}

interface ChunkBound {
  start: number;
  end: number;
}

interface TextSpot {
  node: Text;
  offset: number;
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

export function caretSpotAt(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    return range
      ? { node: range.startContainer, offset: range.startOffset }
      : null;
  }
  return null;
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

function spotIn(host: Element, offset: number): TextSpot | null {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (;;) {
    const text = walker.nextNode() as Text | null;
    if (!text) break;
    const len = text.data.length;
    if (offset <= seen + len) return { node: text, offset: offset - seen };
    seen += len;
    last = text;
  }
  if (last && offset === seen) return { node: last, offset: last.data.length };
  return null;
}

function lineElementAt(
  node: ChunkNode,
  body: string,
  offset: number,
): HTMLElement | null {
  let index = 0;
  let nl = body.indexOf("\n");
  while (nl !== -1 && nl < offset) {
    index++;
    nl = body.indexOf("\n", nl + 1);
  }
  return (node.children[index] as HTMLElement | undefined) ?? null;
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
    const digits = Math.max(2, String(Math.max(lines, 1)).length);
    document.documentElement.style.setProperty(
      "--gutter-digits",
      String(digits),
    );
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

  function updateChunkText(
    node: ChunkNode,
    text: string,
    bound: ChunkBound,
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
    node.innerHTML = plainHtml(raw, bound.start, spans, useBlocks);
  }

  function applyChunkMarks(node: ChunkNode): void {
    const start = node._start;
    const slice = marksInRange(lastMarks, start, start + node._src.length);
    const key = markKey(slice);
    if (node._markKey === key) return;
    node._markKey = key;
    node.innerHTML = slice.length
      ? markedHtml(node._src, start, slice, node._spans, useBlocks)
      : plainHtml(node._src, start, node._spans, useBlocks);
  }

  function applyVisibleMarks(): void {
    const top = root.scrollTop - VIEW_BUFFER_PX;
    const bottom = root.scrollTop + root.clientHeight + VIEW_BUFFER_PX;
    for (const node of nodes) {
      if (node.offsetTop + node.offsetHeight < top) continue;
      if (node.offsetTop > bottom) break;
      applyChunkMarks(node);
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

  function locateInNode(
    node: ChunkNode,
    body: string,
    offset: number,
  ): TextSpot | null {
    if (!useBlocks) return spotIn(node, offset);
    let lineStart = 0;
    let index = 0;
    for (;;) {
      const nl = body.indexOf("\n", lineStart);
      const lineEnd = nl === -1 ? body.length : nl;
      if (offset <= lineEnd) {
        const line = node.children[index] as HTMLElement | undefined;
        if (!line) return null;
        return spotIn(line, offset - lineStart);
      }
      if (nl === -1) return null;
      lineStart = nl + 1;
      index++;
    }
  }

  function caretRectAt(node: ChunkNode, body: string, offset: number): DOMRect {
    const spot = locateInNode(node, body, offset);
    if (!spot) {
      const line = useBlocks ? lineElementAt(node, body, offset) : null;
      return (line ?? node).getBoundingClientRect();
    }
    const range = document.createRange();
    range.setStart(spot.node, spot.offset);
    range.collapse(true);
    return range.getBoundingClientRect();
  }

  function localOffsetAtY(node: ChunkNode, body: string, y: number): number {
    let lo = 0;
    let hi = body.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (caretRectAt(node, body, mid).bottom > y) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  const viewTop = (): number =>
    root.getBoundingClientRect().top + root.clientTop;

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
        updateChunkText(node, text, bounds[i]!);
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
        applyChunkMarks(node);
        found.push(...node.querySelectorAll<HTMLElement>("mark[data-start]"));
      }
      return found;
    },
    markAt(start) {
      const node = nodeAtOffset(start);
      if (node) applyChunkMarks(node);
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
      applyChunkMarks(node);
      const body = stripChunkNewline(node._src);
      const from = start - node._start;
      const to = Math.min(end - node._start, body.length);
      if (from < 0 || to <= from) return null;
      const head = locateInNode(node, body, from);
      const tail = locateInNode(node, body, to);
      if (!head || !tail) return null;
      const range = document.createRange();
      range.setStart(head.node, head.offset);
      range.setEnd(tail.node, tail.offset);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0.5) return rect;
      }
      const box = range.getBoundingClientRect();
      return box.width > 0 ? box : null;
    },
    offsetAtPoint(x, y) {
      const spot = caretSpotAt(x, y);
      if (!spot) return null;
      const node = nodes.find((n) => n !== spot.node && n.contains(spot.node));
      if (!node) return null;
      let host: Node = node;
      let lineStart = 0;
      if (useBlocks) {
        host = spot.node;
        while (host.parentNode && host.parentNode !== node)
          host = host.parentNode;
        const index = Array.prototype.indexOf.call(node.children, host);
        if (index < 0) return null;
        const body = stripChunkNewline(node._src);
        for (let i = 0; i < index; i++)
          lineStart = body.indexOf("\n", lineStart) + 1;
      }
      const range = document.createRange();
      range.setStart(host, 0);
      range.setEnd(spot.node, spot.offset);
      const local = Math.min(
        lineStart + range.toString().length,
        stripChunkNewline(node._src).length,
      );
      return node._start + local;
    },
    offsetAtY(y) {
      const node = nodes.find((n) => n.getBoundingClientRect().bottom > y);
      if (!node) return null;
      const body = stripChunkNewline(node._src);
      return node._start + Math.min(localOffsetAtY(node, body, y), body.length);
    },
    captureTopAnchor() {
      if (root.scrollTop <= 0) {
        topAnchor = null;
        return;
      }
      const node = nodes.find(
        (n) => n.offsetTop + n.offsetHeight > root.scrollTop,
      );
      if (!node) {
        topAnchor = null;
        return;
      }
      const body = stripChunkNewline(node._src);
      const y0 = viewTop();
      const lo = localOffsetAtY(node, body, y0);
      topAnchor = {
        offset: node._start + lo,
        delta: caretRectAt(node, body, lo).top - y0,
      };
    },
    anchoredScrollTop() {
      if (!topAnchor) return null;
      const node = nodeAtOffset(topAnchor.offset);
      if (!node) return null;
      const body = stripChunkNewline(node._src);
      const local = Math.min(topAnchor.offset - node._start, body.length);
      const top = caretRectAt(node, body, local).top - viewTop();
      return Math.max(0, root.scrollTop + top - topAnchor.delta);
    },
  };
}
