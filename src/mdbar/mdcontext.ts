import { lineAt, lineStartAt, lineEndAt } from "../core/text.ts";
import { inRanges, fencedCode } from "../spell/codeskip.ts";
import { codeRanges } from "../spell/skipranges.ts";

export const DIVIDER = /^[\s|:-]*-[\s|:-]*$/;

const QUOTED = /^(?:[ \t]{0,3}>[ \t]?)+/;

export function unquote(line: string): string {
  return line.replace(QUOTED, "");
}

export function inTable(
  text: string,
  from: number,
  to: number,
  line: string,
): boolean {
  const bare = unquote(line);
  if (!bare.includes("|")) return false;
  if (/^\s*\|/.test(bare)) return true;
  const prev = from > 0 ? unquote(lineAt(text, from - 1)) : "";
  const next = to < text.length ? unquote(lineAt(text, to + 1)) : "";
  return (
    (prev.includes("|") && DIVIDER.test(prev)) ||
    (next.includes("|") && DIVIDER.test(next))
  );
}

export function caretInTable(text: string, caret: number): boolean {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  return inTable(text, from, to, text.slice(from, to));
}

export function inFence(text: string, caret: number): boolean {
  if (!text.includes("```") && !text.includes("~~~")) return false;
  return inRanges(codeRanges(text), caret);
}

const MATH_OPEN: Record<string, string> = { $$: "$$", "\\[": "\\]" };

function mathClose(
  close: string | null,
  line: string,
  blank: boolean,
): string | null {
  if (close) return blank || line.includes(close) ? null : close;
  const opener = line.startsWith("$$")
    ? "$$"
    : line.startsWith("\\[")
      ? "\\["
      : "";
  if (!opener) return null;
  const shut = MATH_OPEN[opener]!;
  return line.slice(opener.length).includes(shut) ? null : shut;
}

export function inMath(text: string, caret: number): boolean {
  if (!text.includes("$$") && !text.includes("\\[")) return false;
  const code = fencedCode(text);
  let close: string | null = null;
  let at = 0;
  while (at <= caret) {
    const end = Math.min(lineEndAt(text, at), caret);
    if (!inRanges(code, at)) {
      const line = text.slice(at, end).trim();
      const blank = !text.slice(at, lineEndAt(text, at)).trim();
      close = mathClose(close, line, blank);
    }
    at = end + 1;
  }
  return close !== null;
}
