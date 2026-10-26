import { imageAttrs, parseImageAttrs } from "../markdown.ts";
import type { ImageSize } from "../markdown.ts";
import { codeRanges, inRanges } from "../spell/codeskip.ts";
import { lineEndAt, lineStartAt } from "../core/text.ts";
import type { Edit } from "./mdedit.ts";

const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)\S*$/i;

export function wrapLink(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

  const picked = text.slice(s, e);

  if (!picked) {
    const inserted = "[]()";
    return {
      text: text.slice(0, start) + inserted + text.slice(start),
      start: start + 1,
      end: start + 1,
    };
  }

  if (URLISH.test(picked)) {
    const inserted = "[](" + picked + ")";
    return {
      text: text.slice(0, s) + inserted + text.slice(e),
      start: s + 1,
      end: s + 1,
    };
  }

  const inserted = "[" + picked + "]()";
  const at = s + picked.length + 3;
  return {
    text: text.slice(0, s) + inserted + text.slice(e),
    start: at,
    end: at,
  };
}

export function insertTable(
  text: string,
  caret: number,
  cols = 2,
  rows = 1,
): Edit {
  const to = lineEndAt(text, caret);
  const line = text.slice(lineStartAt(text, caret), to);

  const names = Array.from(
    { length: cols },
    (_, i) => "Багана " + String(i + 1),
  );
  const head = "| " + names.join(" | ") + " |";
  const divider =
    "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const blank =
    "| " + Array.from({ length: cols }, () => "   ").join(" | ") + " |";
  const body = Array.from({ length: rows }, () => blank).join("\n");

  const before = line.trim() ? "\n\n" : "";
  const after = to < text.length ? "\n" : "";
  const block = head + "\n" + divider + "\n" + body;

  const at = to + before.length + 2;
  return {
    text: text.slice(0, to) + before + block + after + text.slice(to),
    start: at,
    end: at + names[0]!.length,
  };
}

function insertBlock(text: string, caret: number, block: string): Edit {
  const to = lineEndAt(text, caret);
  const line = text.slice(lineStartAt(text, caret), to);
  const head = text.slice(0, to) + (line.trim() ? "\n\n" : "") + block + "\n\n";
  return {
    text: head + text.slice(to).replace(/^\n+/, ""),
    start: head.length,
    end: head.length,
  };
}

export function insertPageBreak(text: string, caret: number): Edit {
  return insertBlock(text, caret, "\\newpage");
}

export function insertImage(text: string, caret: number, src: string): Edit {
  return insertBlock(text, caret, "![](" + src + ")");
}

const IMAGE_TOKEN = /!\[[^\]\n]*\]\([^)\s]+\)(?:\{([^{}\n]*)\})?/g;

export function imageSizeAt(text: string, index: number): ImageSize | null {
  const found = nthImage(text, index);
  return found ? parseImageAttrs(found[1] ?? "") : null;
}

function nthImage(text: string, index: number): RegExpExecArray | null {
  const code = codeRanges(text);
  let n = -1;
  IMAGE_TOKEN.lastIndex = 0;
  for (;;) {
    const m = IMAGE_TOKEN.exec(text);
    if (!m) return null;
    if (inRanges(code, m.index) || text[m.index - 1] === "\\") continue;
    n += 1;
    if (n === index) return m;
  }
}

export function setImageSize(
  text: string,
  index: number,
  change: ImageSize,
  caret: number,
): Edit | null {
  const m = nthImage(text, index);
  if (!m) return null;
  const end = m.index + m[0].length;
  const from = end - (m[1] === undefined ? 0 : m[1].length + 2);
  const attrs = imageAttrs({ ...parseImageAttrs(m[1] ?? ""), ...change });
  const delta = attrs.length - (end - from);
  const at = caret >= end ? caret + delta : caret;
  return {
    text: text.slice(0, from) + attrs + text.slice(end),
    start: at,
    end: at,
  };
}
