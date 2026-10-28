import { stripChunkNewline } from "./backdrophtml.ts";
import type { SyntaxSpan } from "./syntaxspans.ts";

export interface ChunkNode extends HTMLDivElement {
  _start: number;
  _src: string;
  _markKey: string | null;
  _spans: SyntaxSpan[];
  _synKey: string;
  _line: number;
  _lines: number;
}

interface TextSpot {
  node: Text;
  offset: number;
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

function locateInNode(
  node: ChunkNode,
  body: string,
  offset: number,
  blocks: boolean,
): TextSpot | null {
  if (!blocks) return spotIn(node, offset);
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

export function caretRectAt(
  node: ChunkNode,
  body: string,
  offset: number,
  blocks: boolean,
): DOMRect {
  const spot = locateInNode(node, body, offset, blocks);
  if (!spot) {
    const line = blocks ? lineElementAt(node, body, offset) : null;
    return (line ?? node).getBoundingClientRect();
  }
  const range = document.createRange();
  range.setStart(spot.node, spot.offset);
  range.collapse(true);
  return range.getBoundingClientRect();
}

function firstOffset(limit: number, past: (offset: number) => boolean): number {
  let lo = 0;
  let hi = limit;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (past(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function localOffsetAtY(
  node: ChunkNode,
  body: string,
  y: number,
  blocks: boolean,
): number {
  return firstOffset(
    body.length,
    (offset) => caretRectAt(node, body, offset, blocks).bottom > y,
  );
}

export function chunkRangeRect(
  node: ChunkNode,
  start: number,
  end: number,
  blocks: boolean,
): DOMRect | null {
  const body = stripChunkNewline(node._src);
  const from = start - node._start;
  const to = Math.min(end - node._start, body.length);
  if (from < 0 || to <= from) return null;
  const head = locateInNode(node, body, from, blocks);
  const tail = locateInNode(node, body, to, blocks);
  if (!head || !tail) return null;
  const range = document.createRange();
  range.setStart(head.node, head.offset);
  range.setEnd(tail.node, tail.offset);
  for (const rect of range.getClientRects()) {
    if (rect.width > 0.5) return rect;
  }
  const box = range.getBoundingClientRect();
  return box.width > 0 ? box : null;
}

export function chunkRangeRects(
  node: ChunkNode,
  start: number,
  end: number,
  blocks: boolean,
): DOMRect[] {
  const body = stripChunkNewline(node._src);
  const from = Math.max(0, start - node._start);
  const to = Math.min(end - node._start, body.length);
  if (to <= from) return [];
  const head = locateInNode(node, body, from, blocks);
  const tail = locateInNode(node, body, to, blocks);
  if (!head || !tail) return [];
  const range = document.createRange();
  range.setStart(head.node, head.offset);
  range.setEnd(tail.node, tail.offset);
  return [...range.getClientRects()].filter((rect) => rect.width > 0.5);
}

export function localOffsetAtPoint(
  node: ChunkNode,
  body: string,
  x: number,
  y: number,
  blocks: boolean,
): number {
  const past = (offset: number): boolean => {
    const rect = caretRectAt(node, body, offset, blocks);
    if (rect.bottom <= y) return false;
    return rect.top > y || rect.left > x;
  };
  return Math.max(0, firstOffset(body.length + 1, past) - 1);
}
