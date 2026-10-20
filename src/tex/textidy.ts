import { ALIGN_ENV, alignRows } from "./texalign.ts";
import { spansInRange, texSpans } from "./texhighlight.ts";

const INDENT = "  ";
const LEAD = /^[ \t]+/;
const TRAIL = /[ \t]+$/;
const BLANK = /^[ \t]*$/;
const SPACE = /^[ \t\n]$/;
const FLAT_ENV = new Set(["document"]);
const RAW_ENV =
  /^(?:verbatim|Verbatim|BVerbatim|LVerbatim|lstlisting|minted|comment|alltt|filecontents|spverbatim|tcblisting)\*?$/;
const RAW_SETUP =
  /\\(?:lstnewenvironment|DefineVerbatimEnvironment|CustomVerbatimEnvironment|RecustomVerbatimEnvironment|newminted|newtcblisting|DeclareTCBListing|NewTCBListing|obeyspaces|obeylines|verbatim\b|NewDocumentEnvironment|NewEnviron)/;
const BEGIN_END = /\\(begin|end)[ \t]*\{([^}\n]*)\}/g;
const DEFINED_ENV =
  /\\(?:newtheorem\*?|newenvironment|renewenvironment)[ \t]*\{([^}\n]+)\}/g;
const KNOWN_ENV = new Set([
  "itemize",
  "enumerate",
  "description",
  "list",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "quotation",
  "verse",
  "abstract",
  "titlepage",
  "figure",
  "figure*",
  "table",
  "table*",
  "subfigure",
  "subtable",
  "wrapfigure",
  "tabular",
  "tabular*",
  "tabularx",
  "tabulary",
  "longtable",
  "array",
  "minipage",
  "multicols",
  "multicols*",
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "flalign",
  "flalign*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "split",
  "aligned",
  "gathered",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "subequations",
  "displaymath",
  "math",
  "proof",
  "thebibliography",
  "frame",
  "block",
  "alertblock",
  "exampleblock",
  "columns",
  "column",
  "tikzpicture",
  "scope",
  "landscape",
  "sloppypar",
]);

interface EnvMark {
  readonly at: number;
  readonly open: boolean;
  readonly name: string;
}

function escaped(text: string, at: number): boolean {
  let count = 0;
  while (at - count - 1 >= 0 && text[at - count - 1] === "\\") count++;
  return count % 2 === 1;
}

function envMarks(text: string): EnvMark[] {
  const spans = texSpans(text);
  const out: EnvMark[] = [];
  for (const match of text.matchAll(BEGIN_END)) {
    const at = match.index;
    if (escaped(text, at)) continue;
    const hidden = spansInRange(spans, at, at + 1).some(
      (span) => span.kind === "comment" || span.kind === "verb",
    );
    if (hidden) continue;
    out.push({ at, open: match[1] === "begin", name: match[2]! });
  }
  return out;
}

function lineOf(starts: readonly number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

type Keep = "none" | "rest" | "all";

interface Plan {
  readonly depth: number[];
  readonly keep: Keep[];
  readonly aligned: Map<number, string>;
}

function knownEnvs(text: string): Set<string> {
  const known = new Set(KNOWN_ENV);
  for (const match of text.matchAll(DEFINED_ENV)) known.add(match[1]!);
  return known;
}

function closingIndex(marks: readonly EnvMark[], from: number): number {
  const name = marks[from]!.name;
  let level = 0;
  for (let i = from; i < marks.length; i++) {
    const mark = marks[i]!;
    if (mark.name !== name) continue;
    level += mark.open ? 1 : -1;
    if (level === 0) return i;
  }
  return -1;
}

function closing(
  marks: readonly EnvMark[],
  from: number,
  text: string,
): number {
  const open = marks[from]!;
  if (RAW_ENV.test(open.name)) {
    const stop = text.indexOf("\\end{" + open.name + "}", open.at);
    return stop === -1 ? text.length : stop;
  }
  const end = closingIndex(marks, from);
  return end === -1 ? text.length : marks[end]!.at;
}

function alignBlocks(
  text: string,
  lines: readonly string[],
  starts: readonly number[],
  marks: readonly EnvMark[],
  keep: readonly Keep[],
): Map<number, string> {
  const aligned = new Map<number, string>();
  marks.forEach((mark, index) => {
    if (!mark.open || !ALIGN_ENV.has(mark.name)) return;
    if (marks[index + 1]?.open !== false) return;
    if (marks[index + 1]!.name !== mark.name) return;
    const stop = marks[index + 1]!.at;
    const first = lineOf(starts, mark.at);
    const last = lineOf(starts, stop);
    if (last - first < 3) return;
    if (!BLANK.test(text.slice(starts[last], stop))) return;
    if (lines[first]!.slice(mark.at - starts[first]!).includes("&")) return;
    for (let i = first; i <= last; i++) if (keep[i] !== "none") return;
    alignRows(lines.slice(first + 1, last), mark.name)?.forEach((row, k) =>
      aligned.set(first + 1 + k, row),
    );
  });
  return aligned;
}

function plan(
  text: string,
  lines: readonly string[],
  starts: readonly number[],
): Plan {
  const count = starts.length;
  const depth = new Array<number>(count).fill(0);
  const keep = new Array<Keep>(count).fill("none");
  const change = new Array<number>(count).fill(0);
  const leadingEnd = new Array<boolean>(count).fill(false);
  const known = knownEnvs(text);
  const marks = envMarks(text);
  let rawUntil = -1;
  marks.forEach((mark, index) => {
    if (mark.at < rawUntil) return;
    const line = lineOf(starts, mark.at);
    if (FLAT_ENV.has(mark.name)) return;
    if (mark.open && !known.has(mark.name)) {
      const stop = closing(marks, index, text);
      rawUntil = stop + 1;
      const last = lineOf(starts, Math.min(stop, text.length - 1));
      if (keep[line] === "none") keep[line] = "rest";
      for (let i = line + 1; i <= last; i++) keep[i] = "all";
      return;
    }
    change[line]! += mark.open ? 1 : -1;
    if (!mark.open && BLANK.test(text.slice(starts[line], mark.at)))
      leadingEnd[line] = true;
  });
  let level = 0;
  for (let i = 0; i < count; i++) {
    depth[i] = Math.max(0, level - (leadingEnd[i] ? 1 : 0));
    level = Math.max(0, level + change[i]!);
  }
  return {
    depth,
    keep,
    aligned: alignBlocks(text, lines, starts, marks, keep),
  };
}

export function tidyTex(text: string): string {
  if (RAW_SETUP.test(text)) return text;
  const lines = text.split("\n");
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }
  const { depth, keep, aligned } = plan(text, lines, starts);
  const out: string[] = [];
  let blank = false;
  lines.forEach((line, i) => {
    if (keep[i] === "all") {
      out.push(line);
      blank = false;
      return;
    }
    if (keep[i] === "rest") {
      out.push(INDENT.repeat(depth[i]!) + line.replace(LEAD, ""));
      blank = false;
      return;
    }
    const body = aligned.get(i) ?? line.replace(LEAD, "").replace(TRAIL, "");
    if (body === "") {
      if (!blank && out.length) out.push("");
      blank = true;
      return;
    }
    blank = false;
    out.push(INDENT.repeat(depth[i]!) + body);
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.length ? out.join("\n") + "\n" : "";
}

export function tidyCaret(
  before: string,
  after: string,
  caret: number,
): number {
  if (caret >= before.length) return after.length;
  let solid = 0;
  for (let i = 0; i < caret && i < before.length; i++)
    if (!SPACE.test(before[i]!)) solid++;
  let at = 0;
  while (solid > 0 && at < after.length) {
    if (!SPACE.test(after[at]!)) solid--;
    at++;
  }
  if (caret < before.length && !SPACE.test(before[caret]!))
    while (at < after.length && SPACE.test(after[at]!)) at++;
  return at;
}
