import { spansInRange } from "../editor/syntaxspans.ts";
import { texSpans } from "./texhighlight.ts";

const BEGIN_DOCUMENT = /\\begin\s*\{document\}/g;

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

export function documentStart(text: string): RegExpExecArray | undefined {
  return liveMatches(text, BEGIN_DOCUMENT)[0];
}
