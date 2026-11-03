import {
  type ChunkNode,
  localOffsetAtY,
  localOffsetAtPoint,
  caretRectAt,
  chunkRangeRects,
} from "./backdropgeom.ts";
import { stripChunkNewline } from "./backdrophtml.ts";

const VIEW_BUFFER_PX = 800;

export function visibleNodes(
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

export function nodesAtY(nodes: readonly ChunkNode[], y: number): ChunkNode[] {
  const out: ChunkNode[] = [];
  for (const node of nodes) {
    const box = node.getBoundingClientRect();
    if (box.bottom < y) continue;
    if (box.top > y) break;
    out.push(node);
  }
  return out;
}

export function nodeAt(
  nodes: readonly ChunkNode[],
  pos: number,
): ChunkNode | null {
  return (
    nodes.find(
      (node) => pos >= node._start && pos < node._start + node._src.length,
    ) ?? null
  );
}

function nodeAtY(nodes: readonly ChunkNode[], y: number): ChunkNode | null {
  return nodes.find((n) => n.getBoundingClientRect().bottom > y) ?? null;
}

export function offsetAtYIn(
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

export function offsetAtPointIn(
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

export function caretRectIn(
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

export function rangeRectsIn(
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
