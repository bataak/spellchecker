import { escapeHtml } from "./htmlutil.ts";
import type { Token } from "./spell/textcheck.ts";
import { spansInRange, type TexSpan } from "./tex/texhighlight.ts";

function paint(
  body: string,
  from: number,
  to: number,
  base: number,
  spans: readonly TexSpan[],
): string {
  if (!spans.length) return escapeHtml(body.slice(from, to));
  let html = "";
  let cursor = from;
  for (const span of spansInRange(spans, base + from, base + to)) {
    const a = Math.max(span.start - base, from);
    const b = Math.min(span.end - base, to);
    if (b <= a) continue;
    html += escapeHtml(body.slice(cursor, a));
    html +=
      '<span class="tx-' +
      span.kind +
      '">' +
      escapeHtml(body.slice(a, b)) +
      "</span>";
    cursor = b;
  }
  return html + escapeHtml(body.slice(cursor, to));
}

export function countLines(raw: string): number {
  const body = stripChunkNewline(raw);
  let count = 1;
  for (let i = 0; i < body.length; i++) {
    if (body.charCodeAt(i) === 10) count++;
  }
  return count;
}

function hangingGuard(body: string): string {
  return body.endsWith("\n") ? "\u200b" : "";
}

export function plainHtml(
  raw: string,
  chunkStart = 0,
  spans: readonly TexSpan[] = [],
  blocks = true,
): string {
  const body = stripChunkNewline(raw);

  if (!blocks) {
    const flat =
      paint(body, 0, body.length, chunkStart, spans) + hangingGuard(body);
    return flat === "" ? "\u200b" : flat;
  }

  let html = "";
  let cursor = 0;
  for (;;) {
    const nl = body.indexOf("\n", cursor);
    const end = nl === -1 ? body.length : nl;
    html +=
      '<div class="bl">' +
      paint(body, cursor, end, chunkStart, spans) +
      "</div>";
    if (nl === -1) break;
    cursor = nl + 1;
  }
  return html;
}

export function markedHtml(
  raw: string,
  chunkStart: number,
  slice: Token[],
  spans: readonly TexSpan[] = [],
  blocks = true,
): string {
  const body = stripChunkNewline(raw);

  if (!blocks) return flatMarkedHtml(body, chunkStart, slice, spans);

  let html = "";
  let lineStart = 0;
  let index = 0;

  for (;;) {
    const nl = body.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? body.length : nl;
    let cursor = lineStart;
    html += '<div class="bl">';

    while (index < slice.length) {
      const mark = slice[index]!;
      const from = mark.start - chunkStart;
      const to = mark.end - chunkStart;
      if (from >= lineEnd) break;
      const clampedFrom = Math.max(from, cursor);
      const clampedTo = Math.min(to, lineEnd);
      if (clampedTo > clampedFrom) {
        html += paint(body, cursor, clampedFrom, chunkStart, spans);
        html +=
          '<mark data-start="' +
          mark.start +
          '">' +
          paint(body, clampedFrom, clampedTo, chunkStart, spans) +
          "</mark>";
        cursor = clampedTo;
      }
      if (to > lineEnd) break;
      index++;
    }

    html += paint(body, cursor, lineEnd, chunkStart, spans) + "</div>";
    if (nl === -1) break;
    lineStart = nl + 1;
  }

  return html;
}

export function stripChunkNewline(raw: string): string {
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

function flatMarkedHtml(
  body: string,
  chunkStart: number,
  slice: Token[],
  spans: readonly TexSpan[],
): string {
  let html = "";
  let cursor = 0;

  for (const mark of slice) {
    const from = mark.start - chunkStart;
    const to = mark.end - chunkStart;
    html += paint(body, cursor, from, chunkStart, spans);
    html +=
      '<mark data-start="' +
      mark.start +
      '">' +
      paint(body, from, to, chunkStart, spans) +
      "</mark>";
    cursor = to;
  }

  html +=
    paint(body, cursor, body.length, chunkStart, spans) + hangingGuard(body);
  return html === "" ? "\u200b" : html;
}
