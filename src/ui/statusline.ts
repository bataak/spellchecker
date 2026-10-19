import { escapeHtml } from "../core/htmlutil.ts";
import { splitName } from "../office/filename.ts";
import { nf } from "./status.ts";

export interface DocStats {
  readonly words: number;
  readonly bad: number;
  readonly chars: number;
}

export interface LinePosition {
  readonly line: number;
  readonly total: number;
}

export const NO_STATS: DocStats = { words: 0, bad: 0, chars: 0 };

export function caretLine(value: string, caret: number): number {
  const end = Math.min(caret, value.length);
  let line = 0;
  for (let i = 0; i < end; i++) {
    if (value.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function statsBody(
  stats: DocStats,
  desktop: boolean,
  position: LinePosition | null,
): string {
  if (desktop)
    return (
      "Үгийн тоо: " + nf(stats.words) + ", Нийт тэмдэгт: " + nf(stats.chars)
    );
  const line = position
    ? ", Мөр: " +
      nf(position.line) +
      " / " +
      nf(Math.max(position.total, position.line))
    : "";
  return (
    "Үгийн тоо: " +
    nf(stats.words) +
    ", <b>Алдаатай үг</b>: <b>" +
    nf(stats.bad) +
    "</b>, Нийт тэмдэгт: " +
    nf(stats.chars) +
    line
  );
}

export function statsMessage(fileName: string | null, body: string): string {
  if (!fileName) return body;
  const parts = splitName(fileName);
  return (
    '<b class="doc-head" title="' +
    escapeHtml(fileName) +
    '">' +
    escapeHtml(parts.head) +
    "</b>" +
    '<b class="doc-keep">' +
    escapeHtml(parts.tail) +
    "</b>" +
    '<span class="doc-rest">' +
    '<span class="doc-sep">, </span>' +
    body +
    "</span>"
  );
}
