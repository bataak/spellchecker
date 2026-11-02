import { spansInRange } from "../editor/syntaxspans.ts";
import { texSpans } from "./texhighlight.ts";

export function literalTest(text: string): (at: number) => boolean {
  const spans = texSpans(text).filter(
    (span) => span.kind === "comment" || span.kind === "verb",
  );
  return (at) => spansInRange(spans, at, at + 1).length > 0;
}

export function liveMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const literal = literalTest(text);
  return [...text.matchAll(pattern)].filter((match) => !literal(match.index));
}
