import type { SyntaxSpan } from "../editor/syntaxspans.ts";

export type TexKind =
  "cmd" | "env" | "comment" | "math" | "delim" | "brace" | "verb";

export interface TexSpan extends SyntaxSpan {
  kind: TexKind;
}

const MATH_ENV =
  /^(?:equation|align|gather|multline|displaymath|flalign|alignat|eqnarray|math)\*?$/;
const VERB_ENV = /^(?:verbatim|lstlisting|minted|comment)\*?$/;
const BEGIN_END = /\\(begin|end)(\s*)\{([^}\n]*)\}/y;

function isLetter(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 64
  );
}

function blankLineAt(text: string, index: number): boolean {
  let cursor = index + 1;
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor);
    if (code === 10) return true;
    if (code !== 32 && code !== 9 && code !== 13) return false;
    cursor++;
  }
  return false;
}

interface Scan {
  readonly text: string;
  readonly out: TexSpan[];
  close: string | null;
}

function push(scan: Scan, start: number, end: number, kind: TexKind): void {
  if (end <= start) return;
  const last = scan.out[scan.out.length - 1];
  if (last && last.kind === kind && last.end === start) last.end = end;
  else scan.out.push({ start, end, kind });
}

function comment(scan: Scan, index: number): number {
  const nl = scan.text.indexOf("\n", index);
  const end = nl === -1 ? scan.text.length : nl;
  push(scan, index, end, "comment");
  return end;
}

function environment(scan: Scan, index: number, env: RegExpExecArray): number {
  const { text } = scan;
  const word = env[1]!;
  const gap = env[2]!;
  const name = env[3]!;
  const brace = index + 1 + word.length + gap.length;
  push(scan, index, index + 1 + word.length, "cmd");
  push(scan, brace, brace + 1, "brace");
  push(scan, brace + 1, brace + 1 + name.length, "env");
  push(scan, brace + 1 + name.length, brace + 2 + name.length, "brace");
  const after = index + env[0].length;
  const end = "\\end{" + name + "}";
  if (word === "begin" && scan.close === null && VERB_ENV.test(name)) {
    const stop = text.indexOf(end, after);
    const verbEnd = stop === -1 ? text.length : stop;
    push(scan, after, verbEnd, "verb");
    return verbEnd;
  }
  if (word === "begin" && scan.close === null && MATH_ENV.test(name))
    scan.close = end;
  else if (word === "end" && scan.close === end) scan.close = null;
  return after;
}

function mathDelim(scan: Scan, index: number): number | null {
  const next = scan.text[index + 1];
  if (scan.close === null && (next === "(" || next === "[")) {
    push(scan, index, index + 2, "delim");
    scan.close = next === "(" ? "\\)" : "\\]";
    return index + 2;
  }
  if (
    (scan.close === "\\)" && next === ")") ||
    (scan.close === "\\]" && next === "]")
  ) {
    push(scan, index, index + 2, "delim");
    scan.close = null;
    return index + 2;
  }
  return null;
}

function commandEnd(text: string, index: number): number {
  let end = index + 1;
  while (end < text.length && isLetter(text.charCodeAt(end))) end++;
  if (end === index + 1) {
    if (end < text.length && text.charCodeAt(end) !== 10) end++;
  } else if (text.charCodeAt(end) === 42) {
    end++;
  }
  return end;
}

function inlineVerb(scan: Scan, end: number): number | null {
  const { text } = scan;
  const mark = text[end]!;
  const stop = mark === "\n" ? -1 : text.indexOf(mark, end + 1);
  const nl = text.indexOf("\n", end + 1);
  if (stop === -1 || (nl !== -1 && stop >= nl)) return null;
  push(scan, end, end + 1, "delim");
  push(scan, end + 1, stop, "verb");
  push(scan, stop, stop + 1, "delim");
  return stop + 1;
}

function command(scan: Scan, index: number): number {
  const { text } = scan;
  const end = commandEnd(text, index);
  push(scan, index, end, "cmd");
  const name = text.slice(index + 1, end);
  if ((name === "verb" || name === "verb*") && end < text.length)
    return inlineVerb(scan, end) ?? end;
  return end;
}

function backslash(scan: Scan, index: number): number {
  BEGIN_END.lastIndex = index;
  const env = BEGIN_END.exec(scan.text);
  if (env) return environment(scan, index, env);
  return mathDelim(scan, index) ?? command(scan, index);
}

function dollar(scan: Scan, index: number): number | null {
  const double = scan.text.charCodeAt(index + 1) === 36;
  if (scan.close === null) {
    scan.close = double ? "$$" : "$";
    const width = double ? 2 : 1;
    push(scan, index, index + width, "delim");
    return index + width;
  }
  if (scan.close === "$" || (scan.close === "$$" && double)) {
    const width = scan.close.length;
    push(scan, index, index + width, "delim");
    scan.close = null;
    return index + width;
  }
  return null;
}

function special(scan: Scan, index: number, code: number): number | null {
  switch (code) {
    case 37:
      return comment(scan, index);
    case 92:
      return backslash(scan, index);
    case 36:
      return dollar(scan, index);
    case 123:
    case 125:
      push(scan, index, index + 1, "brace");
      return index + 1;
    case 38:
      push(scan, index, index + 1, "delim");
      return index + 1;
  }
  return null;
}

export function texSpans(text: string): TexSpan[] {
  const scan: Scan = { text, out: [], close: null };
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    const next = special(scan, index, code);
    if (next !== null) {
      index = next;
      continue;
    }
    if (code === 10 && scan.close !== null && blankLineAt(text, index))
      scan.close = null;
    if (scan.close !== null) push(scan, index, index + 1, "math");
    index++;
  }
  return scan.out;
}
