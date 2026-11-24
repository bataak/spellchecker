const BACKSLASH = 92;

export function escapedAt(text: string, index: number): boolean {
  let slashes = 0;
  while (
    index - slashes > 0 &&
    text.charCodeAt(index - slashes - 1) === BACKSLASH
  )
    slashes += 1;
  return slashes % 2 === 1;
}

export function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

export function lineEndAt(text: string, pos: number): number {
  const i = text.indexOf("\n", pos);
  return i < 0 ? text.length : i;
}

export function lineAt(text: string, index: number): string {
  if (index < 0 || index > text.length) return "";
  return text.slice(lineStartAt(text, index), lineEndAt(text, index));
}

export function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

const CLUSTERED = /\p{M}|\p{Regional_Indicator}|\u200d|[\u{10000}-\u{10ffff}]/u;

let graphemes: Intl.Segmenter | null = null;

export function charCount(text: string): number {
  if (!CLUSTERED.test(text)) return text.length;
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(graphemes.segment(text)).length;
}
