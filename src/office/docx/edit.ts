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

export function planParagraph(
  paragraph: Paragraph,
  edits: ParagraphEdit[],
): PlanResult {
  const ordered = [...edits].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const raw: RawEdit[] = [];
  const applied: ParagraphEdit[] = [];
  const skipped: SkippedEdit[] = [];
  const pending = new Map<TextNode, ParagraphEdit[]>();

  let guard = -1;

  for (const edit of ordered) {
    const insertion = edit.start === edit.end;
    if (edit.start < guard && !insertion) {
      skipped.push({ edit, reason: "overlap" });
      continue;
    }

    if (
      edit.start < 0 ||
      edit.end > paragraph.text.length ||
      edit.start > edit.end
    ) {
      skipped.push({ edit, reason: "not-found" });
      continue;
    }

    const current = paragraph.text.slice(edit.start, edit.end);
    const narrowed = narrowEdit(current, edit.text, edit.start);

    if (narrowed.start === narrowed.end && narrowed.text.length === 0) {
      guard = Math.max(guard, edit.end);
      applied.push(edit);
      continue;
    }

    const nodes = coveredNodes(paragraph, narrowed.start, narrowed.end);

    if (
      nodes.length === 0 ||
      !isContiguous(nodes, narrowed.start, narrowed.end)
    ) {
      skipped.push({ edit, reason: "crosses-boundary" });
      continue;
    }

    if (nodes.length > 1) {
      const signature = normalizeRunProps(nodes[0].runProps);
      const mixed = nodes.some(
        (node) => normalizeRunProps(node.runProps) !== signature,
      );
      if (mixed) {
        skipped.push({ edit, reason: "mixed-format" });
        continue;
      }
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeEnd = node.textStart + node.text.length;
      const operation = {
        start: Math.max(narrowed.start, node.textStart) - node.textStart,
        end: Math.min(narrowed.end, nodeEnd) - node.textStart,
        text: index === 0 ? narrowed.text : "",
      };

      const existing = pending.get(node);
      if (existing === undefined) pending.set(node, [operation]);
      else existing.push(operation);
    }

    guard = Math.max(guard, edit.end);
    applied.push(edit);
  }

  for (const [node, operations] of pending) {
    const sequence = [...operations].sort(
      (left, right) => right.start - left.start || right.end - left.end,
    );
    let next = node.text;

    for (const operation of sequence) {
      next =
        next.slice(0, operation.start) +
        operation.text +
        next.slice(operation.end);
    }

    raw.push(...nodeEdits(node, next));
  }

  if (raw.length > 0) {
    for (const range of paragraph.stale) {
      raw.push({ start: range.start, end: range.end, text: "" });
    }
  }

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
