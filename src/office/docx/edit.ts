import { verbatimText } from "../sanitize.ts";
import { encodeXmlText } from "./xml.ts";
import type { Paragraph, TextNode } from "./parse.ts";
import {
  type ParagraphEdit,
  isSpace,
  splitEdit,
  narrowEdit,
} from "./editdiff.ts";

export interface RawEdit {
  start: number;
  end: number;
  text: string;
}

export type SkipReason =
  "not-found" | "crosses-boundary" | "mixed-format" | "overlap";

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

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

function insertionHost(paragraph: Paragraph, at: number): TextNode | null {
  const touching = paragraph.nodes.filter(
    (node) => node.textStart <= at && at <= node.textStart + node.text.length,
  );
  const left = touching.find(
    (node) => node.text.length > 0 && node.textStart + node.text.length === at,
  );
  if (left !== undefined && WORD_CHAR.test(paragraph.text[at - 1]!))
    return left;
  return touching[touching.length - 1] ?? null;
}

function coveredNodes(
  paragraph: Paragraph,
  start: number,
  end: number,
): TextNode[] {
  if (start === end) {
    const host = insertionHost(paragraph, start);
    return host === null ? [] : [host];
  }

  return paragraph.nodes.filter((node) => {
    const nodeEnd = node.textStart + node.text.length;
    return node.textStart < end && nodeEnd > start;
  });
}

function isContiguous(nodes: TextNode[], start: number, end: number): boolean {
  let cursor = start;

  for (const node of nodes) {
    if (node.textStart > cursor) return false;
    cursor = Math.max(cursor, node.textStart + node.text.length);
  }

  return cursor >= end;
}

function nodeEdits(node: TextNode, next: string): RawEdit[] {
  const needsPreserve =
    next.length > 0 && (isSpace(next[0]!) || isSpace(next[next.length - 1]!));

  if (node.glyph) {
    if (next.length === 0)
      return [{ start: node.tagStart, end: node.tagEnd, text: "" }];

    if (node.wrap === null) {
      return [
        { start: node.tagStart, end: node.tagEnd, text: verbatimText(next) },
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
    const signature = normalizeRunProps(nodes[0]!.runProps);
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
  const sequence = [...operations]
    .reverse()
    .sort((left, right) => right.start - left.start || right.end - left.end);
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
  guardStart: number,
): SkipReason | null {
  const insertion = edit.start === edit.end;
  if (edit.start < guard && (!insertion || edit.start > guardStart))
    return "overlap";
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
  let guardStart = -1;

  for (const edit of ordered) {
    const rejected = rejectReason(paragraph, edit, guard, guardStart);
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
    if (edit.end > guard) {
      guard = edit.end;
      guardStart = edit.start;
    }
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
