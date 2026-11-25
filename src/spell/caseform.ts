export type CasePattern = "lower" | "upper" | "capital";

export function casePattern(src: string): CasePattern {
  if (!src) return "lower";
  let upper = 0,
    lower = 0,
    firstCased = null;
  for (const ch of src) {
    const upperChar = ch.toUpperCase(),
      lowerChar = ch.toLowerCase();
    if (upperChar === lowerChar) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === upperChar) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (upper > lower) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}

export function applyCase(pattern: CasePattern, word: string): string {
  const lo = word.toLowerCase();
  if (pattern === "upper") return word.toUpperCase();
  if (pattern === "capital") return lo.charAt(0).toUpperCase() + lo.slice(1);
  return lo;
}

export function irregularCase(word: string): boolean {
  return applyCase(casePattern(word), word.toLowerCase()) !== word;
}

export function caseRank(pattern: CasePattern): number {
  return pattern === "upper" ? 2 : pattern === "capital" ? 1 : 0;
}

export function rankToPattern(rank: number): CasePattern {
  return rank === 2 ? "upper" : rank === 1 ? "capital" : "lower";
}

export function fitCase(
  found: string,
  replacement: string,
  primary: CasePattern,
): string {
  if (irregularCase(replacement)) return replacement;
  const own = caseRank(casePattern(replacement));
  const floor = own > caseRank(primary) ? own : 0;
  const seen = casePattern(found);
  const single =
    [...found].filter((ch) => ch.toUpperCase() !== ch.toLowerCase()).length ===
    1;
  const rank = Math.max(
    caseRank(single && seen === "upper" ? "capital" : seen),
    floor,
  );
  return applyCase(rankToPattern(rank), replacement);
}
