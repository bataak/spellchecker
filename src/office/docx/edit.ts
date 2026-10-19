import { encodeXmlText } from "./xml.ts";
import type { Paragraph, TextNode } from "./parse.ts";

export interface ParagraphEdit {
  start: number;
  end: number;
  text: string;
}

export interface RawEdit {
  start: number;
  end: number;
  text: string;
}

export type SkipReason =
  | "not-found"
  | "crosses-boundary"
  | "mixed-format"
  | "overlap";

export interface SkippedEdit {
  edit: ParagraphEdit;
  reason: SkipReason;
}

export interface PlanResult {
  raw: RawEdit[];
  applied: ParagraphEdit[];
  skipped: SkippedEdit[];
}

const IGNORED_RUN_PROPS = /<w:(lang|noProof)\b[^>]*\/>/g;

function normalizeRunProps(value: string): string {
  return value.replace(IGNORED_RUN_PROPS, "").replace(/>\s+</g, "><").trim();
}

function isSpace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

export function narrowEdit(
  oldText: string,
  newText: string,
  start: number,
): ParagraphEdit {
  let head = 0;
  const limit = Math.min(oldText.length, newText.length);
  while (head < limit && oldText[head] === newText[head]) head += 1;

  let tail = 0;
  while (
    tail < oldText.length - head &&
    tail < newText.length - head &&
    oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]
  ) {
    tail += 1;
  }

  return {
    start: start + head,
    end: start + oldText.length - tail,
    text: newText.slice(head, newText.length - tail),
  };
}

const TOKEN = /[\p{L}\p{N}\p{M}\u00ad]+|\s+|[^]/gu;

type Step = 0 | 1 | 2;
const KEEP: Step = 0;
const DROP: Step = 1;
const ADD: Step = 2;
const TABLE_CELLS = 4_000_000;
const MAX_CHANGES = 4000;

function tableSteps(before: string[], after: string[]): Step[] {
  const cols = after.length + 1;
  const table = new Uint32Array((before.length + 1) * cols);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        before[i] === after[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      steps.push(KEEP);
      i += 1;
      j += 1;
    } else if (
      j >= after.length ||
      (i < before.length &&
        table[(i + 1) * cols + j] >= table[i * cols + j + 1])
    ) {
      steps.push(DROP);
      i += 1;
    } else {
      steps.push(ADD);
      j += 1;
    }
  }
  return steps;
}

function myersSteps(before: string[], after: string[]): Step[] | null {
  const n = before.length;
  const m = after.length;
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= Math.min(n + m, MAX_CHANGES); d += 1) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return null;
}

function backtrack(
  trace: Int32Array[],
  depth: number,
  n: number,
  m: number,
): Step[] {
  const steps: Step[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d -= 1) {
    const row = trace[d]!;
    const at = (k: number): number => row[k + d + 1]!;
    const k = x - y;
    const prev = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prev);
    const prevY = prevX - prev;
    while (x > prevX && y > prevY) {
      steps.push(KEEP);
      x -= 1;
      y -= 1;
    }
    steps.push(x === prevX ? ADD : DROP);
    x = prevX;
    y = prevY;
  }
  while (x > 0) {
    steps.push(KEEP);
    x -= 1;
  }
  return steps.reverse();
}

export function splitEdit(
  oldText: string,
  newText: string,
  start: number,
): ParagraphEdit[] {
  const before = oldText.match(TOKEN) ?? [];
  const after = newText.match(TOKEN) ?? [];
  const steps =
    (before.length + 1) * (after.length + 1) <= TABLE_CELLS
      ? tableSteps(before, after)
      : myersSteps(before, after);
  if (steps === null) return [narrowEdit(oldText, newText, start)];

  const hunks: ParagraphEdit[] = [];
  let i = 0;
  let j = 0;
  let oldPos = 0;
  let hunkOld = -1;
  let hunkText = "";

  const flush = (): void => {
    if (hunkOld < 0) return;
    hunks.push(
      narrowEdit(oldText.slice(hunkOld, oldPos), hunkText, start + hunkOld),
    );
    hunkOld = -1;
    hunkText = "";
  };

  for (const step of steps) {
    if (step === KEEP) {
      flush();
      oldPos += before[i]!.length;
      i += 1;
      j += 1;
      continue;
    }
    if (hunkOld < 0) hunkOld = oldPos;
    if (step === DROP) {
      oldPos += before[i]!.length;
      i += 1;
    } else {
      hunkText += after[j];
      j += 1;
    }
  }
  flush();

  return hunks;
}

function coveredNodes(
  paragraph: Paragraph,
  start: number,
  end: number,
): TextNode[] {
  if (start === end) {
    let host: TextNode | null = null;
    for (const node of paragraph.nodes) {
      const nodeEnd = node.textStart + node.text.length;
      if (node.textStart <= start && start <= nodeEnd) host = node;
      if (node.textStart > start) break;
    }
    return host === null ? [] : [host];
  }

  return paragraph.nodes.filter((node) => {
    const nodeEnd = node.textStart + node.text.length;
    return node.textStart < end && nodeEnd > start;
  });
}

function isContiguous(
  nodes: TextNode[],
  start: number,
  end: number,
): boolean {
  let cursor = start;

  for (const node of nodes) {
    if (node.textStart > cursor) return false;
    cursor = Math.max(cursor, node.textStart + node.text.length);
  }

  return cursor >= end;
}

function nodeEdits(node: TextNode, next: string): RawEdit[] {
  const needsPreserve =
    next.length > 0 && (isSpace(next[0]) || isSpace(next[next.length - 1]));

  if (node.glyph) {
    if (next.length === 0)
      return [{ start: node.tagStart, end: node.tagEnd, text: "" }];

    if (node.wrap === null) {
      return [
        { start: node.tagStart, end: node.tagEnd, text: encodeXmlText(next) },
      ];
    }

    const attrs = needsPreserve ? ' xml:space="preserve"' : "";
    return [
      {
        start: node.tagStart,
        end: node.tagEnd,
        text: `<${node.wrap}${attrs}>${encodeXmlText(next)}</${node.wrap}>`,
      },
    ];
  }

  if (node.selfClosing) {
    if (next.length === 0 || node.wrap === null) return [];
    const attrs =
      node.preserve || !needsPreserve
        ? node.attrs
        : `${node.attrs} xml:space="preserve"`;
    return [
      {
        start: node.tagStart,
        end: node.tagEnd,
        text: `<${node.wrap}${attrs}>${encodeXmlText(next)}</${node.wrap}>`,
      },
    ];
  }

  const edits: RawEdit[] = [
    {
      start: node.contentStart,
      end: node.contentEnd,
      text: encodeXmlText(next),
    },
  ];

  if (needsPreserve && !node.preserve) {
    edits.push({
      start: node.tagEnd - 1,
      end: node.tagEnd - 1,
      text: ' xml:space="preserve"',
    });
  }

  return edits;
}

function placePiece(
  paragraph: Paragraph,
  piece: ParagraphEdit,
): SkipReason | null {
  const nodes = coveredNodes(paragraph, piece.start, piece.end);

  if (nodes.length === 0 || !isContiguous(nodes, piece.start, piece.end))
    return "crosses-boundary";

  if (nodes.length > 1) {
    const signature = normalizeRunProps(nodes[0].runProps);
    if (nodes.some((node) => normalizeRunProps(node.runProps) !== signature))
      return "mixed-format";
  }

  return null;
}

function placeEdit(
  paragraph: Paragraph,
  edit: ParagraphEdit,
  current: string,
  narrowed: ParagraphEdit,
): ParagraphEdit[] | SkipReason {
  const failure = placePiece(paragraph, narrowed);
  if (failure === null) return [narrowed];
  if (failure !== "mixed-format") return failure;
  const pieces = splitEdit(current, edit.text, edit.start);
  for (const piece of pieces) {
    const reason = placePiece(paragraph, piece);
    if (reason !== null) return reason;
  }
  return pieces;
}

function queuePiece(
  paragraph: Paragraph,
  piece: ParagraphEdit,
  pending: Map<TextNode, ParagraphEdit[]>,
): void {
  const nodes = coveredNodes(paragraph, piece.start, piece.end);
  nodes.forEach((node, index) => {
    const nodeEnd = node.textStart + node.text.length;
    const operation = {
      start: Math.max(piece.start, node.textStart) - node.textStart,
      end: Math.min(piece.end, nodeEnd) - node.textStart,
      text: index === 0 ? piece.text : "",
    };
    const existing = pending.get(node);
    if (existing === undefined) pending.set(node, [operation]);
    else existing.push(operation);
  });
}

function rewriteNode(node: TextNode, operations: ParagraphEdit[]): RawEdit[] {
  const sequence = [...operations].sort(
    (left, right) => right.start - left.start || right.end - left.end,
  );
  let next = node.text;
  for (const operation of sequence)
    next =
      next.slice(0, operation.start) +
      operation.text +
      next.slice(operation.end);
  return nodeEdits(node, next);
}

function rejectReason(
  paragraph: Paragraph,
  edit: ParagraphEdit,
  guard: number,
): SkipReason | null {
  if (edit.start < guard && edit.start !== edit.end) return "overlap";
  if (
    edit.start < 0 ||
    edit.end > paragraph.text.length ||
    edit.start > edit.end
  )
    return "not-found";
  return null;
}

export function planParagraph(
  paragraph: Paragraph,
  edits: ParagraphEdit[],
): PlanResult {
  const ordered = [...edits].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const applied: ParagraphEdit[] = [];
  const skipped: SkippedEdit[] = [];
  const pending = new Map<TextNode, ParagraphEdit[]>();
  let guard = -1;

  for (const edit of ordered) {
    const rejected = rejectReason(paragraph, edit, guard);
    if (rejected !== null) {
      skipped.push({ edit, reason: rejected });
      continue;
    }
    const current = paragraph.text.slice(edit.start, edit.end);
    const narrowed = narrowEdit(current, edit.text, edit.start);
    if (narrowed.start !== narrowed.end || narrowed.text.length !== 0) {
      const placed = placeEdit(paragraph, edit, current, narrowed);
      if (typeof placed === "string") {
        skipped.push({ edit, reason: placed });
        continue;
      }
      for (const piece of placed) queuePiece(paragraph, piece, pending);
    }
    guard = Math.max(guard, edit.end);
    applied.push(edit);
  }

  const raw: RawEdit[] = [];
  for (const [node, operations] of pending)
    raw.push(...rewriteNode(node, operations));
  if (raw.length > 0)
    for (const range of paragraph.stale)
      raw.push({ start: range.start, end: range.end, text: "" });

  return { raw, applied, skipped };
}

export function applyRawEdits(xml: string, edits: RawEdit[]): string {
  const ordered = [...edits].sort(
    (left, right) => right.start - left.start || right.end - left.end,
  );
  let result = xml;
  let barrier = Number.POSITIVE_INFINITY;

  for (const edit of ordered) {
    if (edit.end > barrier) {
      throw new Error(`overlapping raw edit at ${String(edit.start)}`);
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    barrier = edit.start;
  }

  return result;
}
