import { tokenize } from "./spellchecker.ts";
import {
  checkable,
  isDecimalPoint,
  splitNumberBoundary,
  dashNormalized,
} from "./textcheck.ts";
import type { Token } from "./textcheck.ts";
import {
  applyCase,
  caseRank,
  casePattern,
  irregularCase,
  rankToPattern,
} from "./caseform.ts";
import type { CasePattern } from "./caseform.ts";

export type CheckWords = (words: string[]) => Promise<Record<string, boolean>>;

export function replaceAllWord(
  text: string,
  originalLower: string,
  baseRepl: string,
  caretOffset: number,
  primaryPattern: CasePattern,
  onlyAt?: number | null,
): { text: string; caret: number } {
  baseRepl = baseRepl.replace(/\s+$/, "");
  const verbatim = irregularCase(baseRepl);
  const corrRank = caseRank(casePattern(baseRepl));
  const primRank = caseRank(primaryPattern || "lower");
  const floor = corrRank > primRank ? corrRank : 0;
  const targetLower = originalLower.replace(/\s+$/, "");
  let result = "";
  let cursor = 0;
  let caret = caretOffset;
  for (const { word, index } of tokenize(text)) {
    const trail = (word.match(/\s+$/) || [""])[0];
    const core = trail ? word.slice(0, word.length - trail.length) : word;
    if (
      core.toLowerCase() === targetLower &&
      (onlyAt == null || index === onlyAt)
    ) {
      result += text.slice(cursor, index);
      let rep;
      if (verbatim) {
        rep = baseRepl;
      } else {
        const resolvedRank = Math.max(caseRank(casePattern(core)), floor);
        rep = applyCase(rankToPattern(resolvedRank), baseRepl);
      }
      if (caretOffset != null && index + word.length <= caretOffset) {
        caret += rep.length - core.length;
      }
      result += rep + trail;
      cursor = index + word.length;
    }
  }
  result += text.slice(cursor);
  return { text: result, caret };
}

export function wordAtCaret(text: string, pos: number): Token | null {
  for (const { word, index } of tokenize(text)) {
    if (pos >= index && pos <= index + word.length) {
      return { word, start: index, end: index + word.length };
    }
  }
  return null;
}

const INITIAL_RE = /^\p{Lu}[\p{L}\p{M}]?$/u;
const AFTER_INITIAL_RE = /^\p{Lu}/u;

function looksLikeInitial(left: string, right: string): boolean {
  return INITIAL_RE.test(left) && AFTER_INITIAL_RE.test(right);
}

export async function periodSplits(
  word: string,
  checkWords: CheckWords,
): Promise<string[]> {
  const parts: Array<{ left: string; right: string }> = [];

  for (let index = 1; index < word.length - 1; index++) {
    if (word[index] !== ".") continue;
    const left = word.slice(0, index);
    const right = word.slice(index + 1);
    if (right.length < 2) continue;
    if (isDecimalPoint(left, right)) continue;
    parts.push({ left, right });
  }

  if (parts.length === 0) return [];

  const need = new Set<string>();
  for (const part of parts) {
    if (looksLikeInitial(part.left, part.right)) continue;
    if (checkable(part.left)) need.add(part.left);
    if (checkable(part.right)) need.add(part.right);
  }

  const known = need.size
    ? await checkWords([...need])
    : ({} as Record<string, boolean>);
  const good = (piece: string): boolean =>
    !checkable(piece) || known[piece] === true;

  return parts
    .filter(
      (part) =>
        looksLikeInitial(part.left, part.right) ||
        (good(part.left) && good(part.right)),
    )
    .map((part) => part.left + ". " + part.right);
}

export async function numberSplits(
  word: string,
  checkWords: CheckWords,
): Promise<string[]> {
  const split = splitNumberBoundary(word);
  if (!split || !checkable(split.word)) return [];
  const known = await checkWords([split.word]);
  if (known[split.word] !== true) return [];
  return [split.split];
}

export async function dashFixes(
  token: Token,
  checkWords: CheckWords,
): Promise<string[]> {
  const normalized = dashNormalized(token.word);
  if (normalized === null) return [];
  const known = await checkWords([normalized]);
  if (known[normalized] !== true) return [];
  return [normalized];
}

export function scopeToSuffix(token: Token, offered: string[]): string[] {
  if (!token.joined) return offered;
  const head = token.joined.slice(0, token.joined.length - token.word.length);
  return offered
    .filter((item) => item.startsWith(head) && item.length > head.length)
    .map((item) => item.slice(head.length));
}

export function periodSplitDot(word: string, replacement: string): number {
  if (!replacement.includes(". ")) return -1;
  if (replacement.split(". ").join(".") !== word) return -1;
  return replacement.indexOf(". ");
}

export function splitEveryOccurrence(
  text: string,
  word: string,
  dot: number,
  tokenStart: number,
): { text: string; caret: number } | null {
  const target = word.toLowerCase();
  const hits: number[] = [];
  for (const item of tokenize(text)) {
    if (item.word.toLowerCase() === target) hits.push(item.index);
  }
  if (hits.length === 0) return null;

  let next = text;
  for (let index = hits.length - 1; index >= 0; index--) {
    const at = hits[index]! + dot + 1;
    next = next.slice(0, at) + " " + next.slice(at);
  }

  const before = hits.filter((start) => start < tokenStart).length;
  const caret = tokenStart + before + word.length + 1;
  return { text: next, caret };
}
