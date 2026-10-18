import { casePattern, type CasePattern } from "./caseform.ts";
import { inRanges, mergeRanges, type SkipRange } from "./codeskip.ts";
import { dashNormalizeApply, isDashSuffix, type Token } from "./textcheck.ts";
import {
  periodSplitDots,
  replaceAllWord,
  splitEveryOccurrence,
  wordAtCaret,
} from "./wordfix.ts";

export interface Replaced {
  readonly text: string;
  readonly caret: number;
}

export interface PendingFix {
  readonly original: string;
  readonly originalPattern: CasePattern;
  readonly dashSuffix: boolean;
  readonly start: number;
}

export function planSuggestion(
  text: string,
  token: Token,
  replacement: string,
  base: SkipRange[],
  fences: SkipRange[],
): Replaced | null {
  const skip = mergeRanges([...base, ...fences]);

  const dashFix = dashNormalizeApply(text, token, replacement, skip);
  if (dashFix) return dashFix;

  const dots = periodSplitDots(token.word, replacement);
  if (dots.length > 0) {
    const split = splitEveryOccurrence(
      text,
      token.word,
      dots,
      token.start,
      skip,
    );
    if (split) return split;
  }

  const inFence = inRanges(fences, token.start);
  const onlyAt = inFence || isDashSuffix(text, token) ? token.start : null;
  const next = replaceAllWord(
    text,
    token.word.toLowerCase(),
    replacement,
    token.end,
    casePattern(token.word),
    onlyAt,
    inFence ? base : skip,
  );
  return next.text === text ? null : next;
}

export function pendingFixFor(text: string, token: Token): PendingFix {
  return {
    original: token.word.toLowerCase(),
    originalPattern: casePattern(token.word),
    dashSuffix: isDashSuffix(text, token),
    start: token.start,
  };
}

export function editedWord(text: string, pos: number): Token | null {
  if (pos > 0 && /[\s\p{P}\p{S}]/u.test(text.charAt(pos - 1))) {
    const prev = wordAtCaret(text, pos - 1);
    if (prev && prev.end === pos - 1) return prev;
  }
  return wordAtCaret(text, pos);
}

export type FixStep =
  | { readonly kind: "drop" }
  | { readonly kind: "wait" }
  | { readonly kind: "check"; readonly word: string };

export function nextFixStep(
  fix: PendingFix,
  text: string,
  pos: number,
): FixStep {
  if (fix.dashSuffix) return { kind: "drop" };
  const edited = editedWord(text, pos);
  if (!edited) return { kind: "wait" };
  if (edited.start !== fix.start) return { kind: "drop" };
  if (edited.word.toLowerCase() === fix.original) return { kind: "wait" };
  if (fix.original.length - edited.word.length > 2) return { kind: "wait" };
  return { kind: "check", word: edited.word };
}

export function propagateFix(
  text: string,
  pos: number,
  fix: PendingFix,
  word: string,
  skip: SkipRange[],
): Replaced | null {
  const next = replaceAllWord(
    text,
    fix.original,
    word,
    pos,
    fix.originalPattern || "lower",
    null,
    skip,
  );
  return next.text === text ? null : next;
}
