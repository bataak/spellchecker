import { caretSpotAt } from "../editor/backdropgeom.ts";

const WORD_CHAR = /[\p{L}\p{N}]/u;
const WORDS = /[\p{L}\p{N}]+/gu;

export function lineOffset(text: string, line: number): number {
  let at = 0;
  for (let i = 0; i < line; i++) {
    const next = text.indexOf("\n", at);
    if (next < 0) return text.length;
    at = next + 1;
  }
  return at;
}

export function nthWordHit(
  text: string,
  word: string,
  nth: number,
): { readonly index: number; readonly length: number } | null {
  const hits = [...text.matchAll(WORDS)].filter(
    (m) => m[0].toLowerCase() === word,
  );
  const hit = hits[Math.min(nth, hits.length - 1)];
  return hit ? { index: hit.index, length: hit[0].length } : null;
}

function countWord(text: string, word: string): number {
  return [...text.matchAll(WORDS)].filter((m) => m[0].toLowerCase() === word)
    .length;
}

function lineBlocks(body: HTMLElement): HTMLElement[] {
  return [...body.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.dataset.line !== undefined,
  );
}

const ARROW_MAX = 14;
const ARROW_MIN = 6;
const ARROW_GAP = 4;

export function lineArrow(
  top: number,
  left: number,
  lineHeight: number,
): { top: number; left: number; width: number; height: number } {
  const size = Math.max(ARROW_MIN, Math.min(ARROW_MAX, lineHeight * 0.55));
  return {
    top: top + (lineHeight - size) / 2,
    left: Math.max(0, left - size - ARROW_GAP),
    width: size,
    height: size,
  };
}

function lineHeightOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).lineHeight) || 24;
}

function lineTarget(
  el: HTMLElement,
  lines: readonly string[],
  start: number,
  line: number,
  end: number,
): { readonly box: DOMRect; readonly height: number } {
  const box = el.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
  const before = lines.slice(start, line).filter((l) => l.trim());
  if (el instanceof HTMLTableElement) {
    const rows = before.filter((l) => !/^[\s|:-]*-[\s|:-]*$/.test(l));
    const index = rows.length - (el.tHead ? 0 : 1);
    const row = el.rows[Math.min(Math.max(index, 0), el.rows.length - 1)];
    if (row) {
      const rect = row.getBoundingClientRect();
      return { box: rect, height: rect.height };
    }
  }
  if (el instanceof HTMLOListElement || el instanceof HTMLUListElement) {
    const indent = /^\s*/.exec(lines[start] ?? "")![0].length;
    const marker = /^(\s*)(?:[-*+]|\d+[.)])\s/;
    const count = before.filter((l) => {
      const m = marker.exec(l);
      return m && m[1]!.length === indent;
    }).length;
    const current = marker.exec(lines[line] ?? "");
    const index = current && current[1]!.length === indent ? count : count - 1;
    const items = [...el.children].filter((c) => c.tagName === "LI");
    const item = items[Math.min(Math.max(index, 0), items.length - 1)];
    if (item) {
      const rect = item.getBoundingClientRect();
      return { box: rect, height: Math.min(rect.height, lineHeight) };
    }
  }
  const filled = lines.slice(start, end).filter((l) => l.trim()).length;
  const fraction = filled > 1 ? before.length / filled : 0;
  const top = Math.min(
    box.top + fraction * box.height,
    box.top + Math.max(box.height - lineHeight, 0),
  );
  return {
    box: new DOMRect(box.left, top, box.width, lineHeight),
    height: lineHeight,
  };
}

export interface HtmlSync {
  revealLine(line: number): void;
  jumpFrom(clientX: number, clientY: number): void;
  destroy(): void;
}

export function createHtmlSync(
  body: HTMLElement,
  area: HTMLTextAreaElement,
  inset: () => number,
  jump: (start: number, end: number) => void,
): HtmlSync {
  let lineMark: HTMLElement | null = null;
  let lineMarkTimer = 0;

  const revealLine = (line: number): void => {
    const blocks = lineBlocks(body);
    if (!blocks.length) return;
    let k = 0;
    while (k + 1 < blocks.length && Number(blocks[k + 1]!.dataset.line) <= line)
      k++;
    const el = blocks[k]!;
    const lines = area.value.split("\n");
    const start = Number(el.dataset.line);
    const next = blocks[k + 1];
    const end = next ? Number(next.dataset.line) : lines.length;
    const { box, height } = lineTarget(el, lines, start, line, end);
    const frame = body.getBoundingClientRect();
    const at = box.top - frame.top - body.clientTop + body.scrollTop;
    const offset = inset();
    const top = body.scrollTop + offset;
    const room = body.clientHeight - offset;
    if (at < top + room * 0.15 || at + height > top + room * 0.85)
      body.scrollTop = at - offset - room * 0.35;
    const left = el.getBoundingClientRect().left - frame.left - body.clientLeft;
    lineMark ??= document.createElement("div");
    lineMark.className = "sync-mark";
    const arrow = lineArrow(at, left, Math.min(height, lineHeightOf(el)));
    lineMark.style.top = arrow.top + "px";
    lineMark.style.left = arrow.left + "px";
    lineMark.style.width = arrow.width + "px";
    lineMark.style.height = arrow.height + "px";
    lineMark.classList.remove("is-fading");
    body.append(lineMark);
    clearTimeout(lineMarkTimer);
    lineMarkTimer = window.setTimeout(
      () => lineMark?.classList.add("is-fading"),
      900,
    );
  };

  const jumpFrom = (clientX: number, clientY: number): void => {
    const spot = caretSpotAt(clientX, clientY);
    if (!spot || !body.contains(spot.node)) return;
    let block =
      spot.node instanceof HTMLElement ? spot.node : spot.node.parentElement;
    while (block && block.parentElement !== body) block = block.parentElement;
    if (!block?.dataset.line) return;
    const blocks = lineBlocks(body);
    const text = area.value;
    const startLine = Number(block.dataset.line);
    const next = blocks[blocks.indexOf(block) + 1];
    const from = lineOffset(text, startLine);
    const to = next ? lineOffset(text, Number(next.dataset.line)) : text.length;

    let word = "";
    let wordStart = spot.offset;
    if (spot.node instanceof Text) {
      const data = spot.node.data;
      let a = spot.offset;
      let b = spot.offset;
      while (a > 0 && WORD_CHAR.test(data[a - 1]!)) a--;
      while (b < data.length && WORD_CHAR.test(data[b]!)) b++;
      word = data.slice(a, b).toLowerCase();
      wordStart = a;
    }
    if (!word) {
      jump(from, from);
      return;
    }
    const range = document.createRange();
    range.setStart(block, 0);
    range.setEnd(spot.node, wordStart);
    const hit = nthWordHit(
      text.slice(from, to),
      word,
      countWord(range.toString(), word),
    );
    if (!hit) {
      jump(from, from);
      return;
    }
    jump(from + hit.index, from + hit.index + hit.length);
  };

  return {
    revealLine,
    jumpFrom,
    destroy() {
      clearTimeout(lineMarkTimer);
    },
  };
}
