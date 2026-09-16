export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface View {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export function pickDefinitionMarks(
  suggestions: string[],
  found: Record<string, string> | null,
  sameRoot: (left: string, right: string) => boolean,
): Set<string> {
  const marked = new Set<string>();
  if (!found) return marked;
  const roots: { word: string; headword: string }[] = [];
  for (const suggestion of suggestions) {
    const headword = found[suggestion];
    if (headword == null) continue;
    const word = suggestion.toLowerCase();
    const head = headword.toLowerCase();
    if (
      roots.some(
        (root) =>
          root.headword === head ||
          root.word === word ||
          sameRoot(root.word, word),
      )
    )
      continue;
    roots.push({ word, headword: head });
    marked.add(suggestion);
  }
  return marked;
}

export function displayHeadword(headword: string, word: string): string {
  if (headword.toLowerCase() === word.toLowerCase()) return word;
  const allUpper = /\p{Lu}/u.test(headword) && !/\p{Ll}/u.test(headword);
  return allUpper ? headword.toLowerCase() : headword;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function placeTip(
  anchor: Box,
  container: Box,
  tip: Size,
  view: View,
  gap = 8,
): { left: number; top: number } {
  const viewRight = view.left + view.width;
  const viewBottom = view.top + view.height;
  let left: number;
  let top: number;
  if (container.right + gap + tip.width <= viewRight - gap) {
    left = container.right + gap;
    top = anchor.top;
  } else if (container.left - gap - tip.width >= view.left + gap) {
    left = container.left - gap - tip.width;
    top = anchor.top;
  } else {
    left = anchor.right - tip.width;
    top = anchor.bottom + gap;
    if (top + tip.height > viewBottom - gap)
      top = anchor.top - gap - tip.height;
  }
  return {
    left: clamp(left, view.left + gap, viewRight - gap - tip.width),
    top: clamp(top, view.top + gap, viewBottom - gap - tip.height),
  };
}

export function clipText(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  const head = chars.slice(0, limit).join("");
  const cut = head.search(/\s\S*$/);
  return (cut > limit * 0.6 ? head.slice(0, cut) : head).trimEnd() + "\u2026";
}
