import type { Token } from "./textcheck.ts";

export interface TextEdit {
  start: number;
  oldEnd: number;
  newEnd: number;
}

export function shiftTokens(tokens: Token[], edit: TextEdit): Token[] {
  const delta = edit.newEnd - edit.oldEnd;
  const kept: Token[] = [];
  for (const token of tokens) {
    if (token.end < edit.start) {
      kept.push(token);
    } else if (token.start > edit.oldEnd) {
      kept.push({
        ...token,
        start: token.start + delta,
        end: token.end + delta,
      });
    }
  }
  return kept;
}
