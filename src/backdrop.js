import { escapeHtml } from "./htmlutil.js";

const CHUNK_TARGET = 4096;
const VIEW_BUFFER_PX = 800;

let root = null;
let trailer = null;
let nodes = [];
let lastMarks = [];

export function initBackdrop(el) {
  root = el;
  root.textContent = "";
  nodes = [];
  trailer = document.createElement("div");
  trailer.textContent = "\u200b";
  root.appendChild(trailer);
}

export function renderBackdrop(text, marks) {
  lastMarks = marks;
  const bounds = splitChunks(text);
  syncChunkCount(bounds.length);
  for (let i = 0; i < bounds.length; i++) {
    updateChunkText(nodes[i], text, bounds[i]);
  }
  applyVisibleMarks();
}

export function refreshBackdropMarks() {
  applyVisibleMarks();
}

export function materializeMark(start) {
  const node = nodeAtOffset(start);
  if (node) applyChunkMarks(node);
}

function splitChunks(text) {
  const bounds = [];
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

function syncChunkCount(count) {
  while (nodes.length > count) nodes.pop().remove();
  while (nodes.length < count) {
    const div = document.createElement("div");
    root.insertBefore(div, trailer);
    nodes.push(div);
  }
}

function updateChunkText(node, text, bound) {
  const raw = text.slice(bound.start, bound.end);
  node._start = bound.start;
  if (node._src === raw) return;
  node._src = raw;
  node._markKey = null;
  node.innerHTML = plainHtml(raw);
}

function applyVisibleMarks() {
  if (!root) return;
  const top = root.scrollTop - VIEW_BUFFER_PX;
  const bottom = root.scrollTop + root.clientHeight + VIEW_BUFFER_PX;
  for (const node of nodes) {
    if (node.offsetTop + node.offsetHeight < top) continue;
    if (node.offsetTop > bottom) break;
    applyChunkMarks(node);
  }
}

function applyChunkMarks(node) {
  const start = node._start;
  const slice = marksInRange(lastMarks, start, start + node._src.length);
  const key = markKey(slice);
  if (node._markKey === key) return;
  node._markKey = key;
  node.innerHTML = slice.length
    ? markedHtml(node._src, start, slice)
    : plainHtml(node._src);
}

function marksInRange(marks, start, end) {
  let lo = 0;
  let hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].start < start) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < marks.length && marks[i].start < end; i++) {
    out.push(marks[i]);
  }
  return out;
}

function markKey(slice) {
  let key = "";
  for (const mark of slice) key += mark.start + ":" + mark.end + ",";
  return key;
}

function plainHtml(raw) {
  const html = escapeHtml(stripChunkNewline(raw));
  return html === "" ? "\u200b" : html;
}

function markedHtml(raw, chunkStart, slice) {
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
  html += escapeHtml(body.slice(cursor));
  return html === "" ? "\u200b" : html;
}

function stripChunkNewline(raw) {
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

function nodeAtOffset(pos) {
  for (const node of nodes) {
    if (pos >= node._start && pos < node._start + node._src.length) {
      return node;
    }
  }
  return null;
}
