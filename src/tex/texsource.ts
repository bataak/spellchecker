import { spansInRange } from "../editor/syntaxspans.ts";
import { texSpans, type TexSpan } from "./texhighlight.ts";

const BEGIN_DOCUMENT = /\\begin\s*\{document\}/g;
const DOCUMENT_CLASS = /\\documentclass\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/;
const USED_PACKAGES =
  /\\(?:usepackage|RequirePackage)\s*(\[[^\]]*\]\s*)?\{([^{}]*)\}/g;

const OPEN_VERB = /(?<!\\)\\verb\*?([^A-Za-z\s*])(?:(?!\1).)*$/;

type Replacer = (whole: string, ...groups: (string | undefined)[]) => string;

function packageNames(calls: readonly RegExpExecArray[]): Set<string> {
  return new Set(
    calls.flatMap((call) => call[2]!.split(",").map((name) => name.trim())),
  );
}

export class TexSource {
  private static latest: TexSource | null = null;
  private scanned: readonly TexSpan[] | null = null;
  private closed: readonly TexSpan[] | null = null;

  readonly text: string;

  private constructor(text: string) {
    this.text = text;
  }

  static of(text: string): TexSource {
    if (TexSource.latest?.text !== text) TexSource.latest = new TexSource(text);
    return TexSource.latest;
  }

  private get literals(): readonly TexSpan[] {
    this.scanned ??= texSpans(this.text).filter(
      (span) => span.kind === "comment" || span.kind === "verb",
    );
    return this.scanned;
  }

  private get code(): readonly TexSpan[] {
    this.closed ??= texSpans(this.text + "\n").filter(
      (span) => span.kind === "verb",
    );
    return this.closed;
  }

  isLiteral(at: number): boolean {
    return spansInRange(this.literals, at, at + 1).length > 0;
  }

  inComment(at: number): boolean {
    return spansInRange(this.literals, at - 1, at).some(
      (span) => span.kind === "comment",
    );
  }

  insideCode(at: number): boolean {
    const line = this.text.slice(this.text.lastIndexOf("\n", at - 1) + 1, at);
    return (
      OPEN_VERB.test(line) ||
      this.code.some((span) => span.start <= at && at <= span.end)
    );
  }

  matches(pattern: RegExp): RegExpExecArray[] {
    return [...this.text.matchAll(pattern)].filter(
      (match) => !this.isLiteral(match.index),
    );
  }

  replace(pattern: RegExp, replacer: Replacer): string {
    return this.text.replace(pattern, (whole: string, ...rest: unknown[]) =>
      this.isLiteral(rest.at(-2) as number)
        ? whole
        : replacer(whole, ...(rest.slice(0, -2) as (string | undefined)[])),
    );
  }

  live(): string {
    let out = "";
    let from = 0;
    for (const span of this.literals) {
      out += this.text.slice(from, span.start);
      from = span.end;
    }
    return out + this.text.slice(from);
  }

  blankedComments(): string {
    let out = "";
    let from = 0;
    for (const span of this.literals) {
      if (span.kind !== "comment") continue;
      out +=
        this.text.slice(from, span.start) + " ".repeat(span.end - span.start);
      from = span.end;
    }
    return out + this.text.slice(from);
  }

  documentStart(): RegExpExecArray | undefined {
    return this.matches(BEGIN_DOCUMENT)[0];
  }

  documentClass(): string | null {
    return DOCUMENT_CLASS.exec(this.live())?.[1]?.trim() ?? null;
  }

  packages(): Set<string> {
    return packageNames(this.matches(USED_PACKAGES));
  }

  configuredPackages(): Set<string> {
    return packageNames(this.matches(USED_PACKAGES).filter((call) => call[1]));
  }
}
