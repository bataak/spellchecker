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
