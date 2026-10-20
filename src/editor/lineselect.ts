export type LineDirection = "up" | "down";

function lineStart(text: string, at: number): number {
  return text.lastIndexOf("\n", at - 1) + 1;
}

function nextLineStart(text: string, at: number): number {
  const newline = text.indexOf("\n", at);
  return newline === -1 ? text.length : newline + 1;
}

export function lineSelection(
  text: string,
  start: number,
  end: number,
  direction: LineDirection,
): [number, number] {
  const from = lineStart(text, start);
  const to =
    end > start && (end === text.length || text[end - 1] === "\n")
      ? end
      : nextLineStart(text, end);
  const whole = end > start && start === from && end === to;
  if (!whole) return [from, to];
  if (direction === "down") return [from, nextLineStart(text, to)];
  return [from > 0 ? lineStart(text, from - 1) : 0, to];
}
