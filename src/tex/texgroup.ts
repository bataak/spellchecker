export function groupEnd(
  text: string,
  at: number,
  open = "{",
  close = "}",
): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") i++;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return i + 1;
  }
  return -1;
}
