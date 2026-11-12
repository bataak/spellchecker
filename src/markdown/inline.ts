import { dollarMath } from "../spell/skipranges.ts";
import { type Inline } from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { type MathOpen } from "./texlogo.ts";

const HOLD = "\u0001";

const MATH_HOLD = "\u0002";

export const HARD = "\u0003";

const BRACKET = "\u0004";

const MATH_AT =
  /(`+)[\s\S]*?\1|\\begin\{math\}([\s\S]*?)\\end\{math\}|\\\(([\s\S]*?)\\\)|\\[\s\S]|\$\$((?:[^$\\]|\\.)+?)\$\$|(?<![$\d])\$(?![\s$])((?:[^$\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?![\d$])|(?<![\p{L}\p{N}_])(_{3,})(?![\p{L}\p{N}_])/uy;

interface Scan {
  readonly at: RegExp;
  readonly start: RegExp;
}

const MATH: Scan = { at: MATH_AT, start: /[`\\$_]/g };
const CELL: Scan = {
  at: new RegExp(MATH_AT.source + "|\\|", "uy"),
  start: /[`\\$_|]/g,
};
const PAREN_OPEN = "\\(";
const ENV_OPEN = "\\begin{math}";

function spansOf(src: string, scan: Scan): RegExpExecArray[] {
  const found: RegExpExecArray[] = [];
  const paren = src.lastIndexOf("\\)");
  const env = src.lastIndexOf("\\end{math}");
  let at = 0;
  for (;;) {
    scan.start.lastIndex = at;
    const next = scan.start.exec(src);
    if (!next) return found;
    at = next.index;
    const unclosed =
      (src.startsWith(PAREN_OPEN, at) && paren < at + PAREN_OPEN.length) ||
      (src.startsWith(ENV_OPEN, at) && env < at + ENV_OPEN.length);
    if (unclosed) {
      at += 2;
      continue;
    }
    scan.at.lastIndex = at;
    const match = scan.at.exec(src);
    if (match) found.push(match);
    at += match ? match[0].length : 1;
  }
}

export function splitPipes(line: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const match of spansOf(line, CELL)) {
    if (match[0] !== "|") continue;
    parts.push(line.slice(from, match.index));
    from = match.index + 1;
  }
  parts.push(line.slice(from));
  return parts;
}

const ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

function closingRun(src: string, from: number, width: number): number {
  for (let i = from; i < src.length; i++) {
    if (src[i] !== "`") continue;
    let end = i;
    while (src[end] === "`") end++;
    if (end - i === width) return i;
    i = end;
  }
  return -1;
}

function mask(src: string, held: string[]): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && ESCAPABLE.includes(src[i + 1] ?? "\n")) {
      held.push(src[i + 1]!);
      out += HOLD + (held.length - 1) + HOLD;
      i += 2;
      continue;
    }
    if (ch !== "`") {
      out += ch;
      i++;
      continue;
    }
    let open = i;
    while (src[open] === "`") open++;
    const close = closingRun(src, open, open - i);
    const end = close < 0 ? open : close + open - i;
    out += src.slice(i, end);
    i = end;
  }
  return out;
}

const LINK_TAIL = /\]\((?:[^()\s]|\([^()\s]*\))*\)/y;

function maskBrackets(src: string): string {
  if (!src.includes("[")) return src;
  const parts: string[] = [];
  let end = src.length;
  let opens = false;
  for (let i = src.length - 1; i >= 0; i--) {
    if (src[i] === "]") {
      LINK_TAIL.lastIndex = i;
      opens = LINK_TAIL.test(src);
    } else if (src[i] === "[" && !opens) {
      parts.push(src.slice(i + 1, end));
      end = i;
    }
  }
  parts.push(src.slice(0, end));
  return parts.reverse().join(BRACKET);
}

function unmask(src: string, held: string[], raw = false): string {
  return src
    .replace(new RegExp(HOLD + "(\\d+)" + HOLD, "g"), (_, i: string) =>
      held[Number(i)] === undefined ? "" : (raw ? "\\" : "") + held[Number(i)],
    )
    .replaceAll(BRACKET, "[");
}

const PUNCT = "\\p{P}\\p{S}\\u0001\\u0002\\u0004";
const WORD = "\\p{L}\\p{N}";

const opening = (ch: string, n: number): string => {
  const run = ch.repeat(n);
  return (
    "(?<!" +
    ch +
    ")" +
    run +
    "(?!" +
    ch +
    ")(?!\\s)(?:(?![" +
    PUNCT +
    "])|(?<![^\\s" +
    PUNCT +
    "]" +
    run +
    "))"
  );
};

const closing = (ch: string, n: number): string => "(?<!\\s)" + ch.repeat(n);

const emphasis = (ch: string, n: number, body: string): string =>
  opening(ch, n) + "(" + body + ")" + closing(ch, n);

const wordBound = (pattern: string): string =>
  "(?<![" + WORD + "])" + pattern + "(?![" + WORD + "])";

const LINK = "\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))*)\\)";
const IMAGE =
  "!\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)(?:\\{([^{}]*)\\})?";
const NEVER = (pattern: string): string => pattern.replace("\\[", "\\[(?!)");

interface Span {
  readonly mark: string;
  readonly width: number;
  readonly pattern: string;
  readonly head: RegExp;
  readonly opener: RegExp;
  readonly closer: RegExp;
}

const span = (ch: string, n: number, bound: boolean): Span => {
  const before = bound ? "(?<![" + WORD + "])" : "";
  const after = bound ? "(?![" + WORD + "])" : "";
  const open = before + opening(ch, n);
  return {
    mark: ch.slice(-1),
    width: n,
    pattern: before + emphasis(ch, n, "[\\s\\S]+?") + after,
    head: new RegExp(open, "iuy"),
    opener: new RegExp(open, "giu"),
    closer: new RegExp("(?<!\\s)(?=" + ch.repeat(n) + after + ")", "giu"),
  };
};

const SPANS: readonly Span[] = [
  span("~", 2, false),
  span("\\*", 3, false),
  span("_", 3, true),
  span("\\*", 2, false),
  span("_", 2, true),
];
const DEAD_SPAN = "(?!)()";

const tokenPattern = (link: string, image: string, live: number): RegExp =>
  new RegExp(
    [
      "(`+)([\\s\\S]*?)\\1",
      ...SPANS.map((each, i) => (live & (1 << i) ? each.pattern : DEAD_SPAN)),
      emphasis("\\*", 1, "[^*]+?"),
      wordBound(emphasis("_", 1, "[^_]+?")),
      link,
      "<((?:[a-z][a-z0-9+.-]*:|[^\\s<>@]+@)[^\\s<>]+)>",
      MATH_HOLD + "(\\d+)" + MATH_HOLD,
      image,
    ].join("|"),
    "iu",
  );

const TOKENS = new Map<number, RegExp>();

function tokenFor(live: number, linked: boolean): RegExp {
  const key = live * 2 + (linked ? 1 : 0);
  let token = TOKENS.get(key);
  if (!token) {
    token = linked
      ? tokenPattern(LINK, IMAGE, live)
      : tokenPattern(NEVER(LINK), NEVER(IMAGE), live);
    TOKENS.set(key, token);
  }
  return token;
}

interface Reach {
  readonly last: number;
  first: number;
  none: boolean;
}

function reachesOf(src: string): Reach[] {
  return SPANS.map((each) => {
    let last = -1;
    if (src.includes(each.mark))
      for (const match of src.matchAll(each.closer)) last = match.index;
    return { last: last < 0 ? 0 : src.length - last, first: 0, none: false };
  });
}

function firstOpener(each: Span, rest: string, reach: Reach): number {
  each.head.lastIndex = 0;
  if (each.head.test(rest)) return 0;
  if (reach.none) return -1;
  const known = rest.length - reach.first;
  if (reach.first && known > 0) return known;
  each.opener.lastIndex = 1;
  const found = each.opener.exec(rest);
  reach.none = !found;
  reach.first = found ? rest.length - found.index : 0;
  return found ? found.index : -1;
}

function liveSpans(rest: string, reaches: readonly Reach[]): number {
  let live = 0;
  SPANS.forEach((each, i) => {
    const reach = reaches[i]!;
    const last = rest.length - reach.last;
    if (!reach.last || last < 1) return;
    const first = firstOpener(each, rest, reach);
    if (first >= 0 && last > first + each.width) live |= 1 << i;
  });
  return live;
}

export interface ImageSize {
  width?: number;
  rotate?: number;
}

export function parseImageAttrs(attrs: string): ImageSize {
  const { keys } = parseAttrs("{" + attrs + "}");
  const out: ImageSize = {};
  const width = /^(\d+(?:\.\d+)?)%$/.exec(keys["width"] ?? "")?.[1];
  if (width !== undefined && Number(width) > 0)
    out.width = Math.min(100, Number(width));
  const rotate = (((Number(keys["rotate"]) || 0) % 360) + 360) % 360;
  if (rotate % 90 === 0 && rotate !== 0) out.rotate = rotate;
  return out;
}

function imageNode(alt: string, src: string, attrs: string): Inline {
  return { type: "image", alt, src, ...parseImageAttrs(attrs) };
}

export function imageAttrs(node: {
  readonly width?: number;
  readonly rotate?: number;
}): string {
  const parts = [
    node.width === undefined ? "" : "width=" + String(node.width) + "%",
    node.rotate ? "rotate=" + String(node.rotate) : "",
  ].filter(Boolean);
  return parts.length ? "{" + parts.join(" ") + "}" : "";
}

function appendText(out: Inline[], s: string, held: string[]): void {
  if (!s) return;
  const parts = unmask(s, held).split("\n");
  parts.forEach((part, index) => {
    const hard = index < parts.length - 1 && part.endsWith(HARD);
    const value = hard ? part.slice(0, -1) : part;
    if (value) {
      const last = out.at(-1);
      if (last?.type === "text") last.value += value;
      else out.push({ type: "text", value });
    }
    if (index < parts.length - 1)
      out.push({ type: hard ? "break" : "softbreak" });
  });
}

function emphasisNode(
  m: RegExpExecArray,
  inner: (src: string) => Inline[],
): Inline | null {
  if (m[3] !== undefined) return { type: "del", children: inner(m[3]) };
  const both = m[4] ?? m[5];
  if (both)
    return {
      type: "strong",
      children: [{ type: "em", children: inner(both) }],
    };
  const strong = m[6] ?? m[7];
  if (strong) return { type: "strong", children: inner(strong) };
  const em = m[8] ?? m[9];
  if (em) return { type: "em", children: inner(em) };
  return null;
}

function tokenNode(
  m: RegExpExecArray,
  held: string[],
  lifted: readonly Inline[],
): Inline | null {
  const inner = (src: string): Inline[] => parseInlineMasked(src, held, lifted);
  if (m[2] !== undefined)
    return {
      type: "code",
      value: unmask(m[2].replace(/\n/g, " ").trim(), held, true),
    };
  const emphasis = emphasisNode(m, inner);
  if (emphasis) return emphasis;
  if (m[15] !== undefined)
    return imageNode(
      unmask(m[14] ?? "", held),
      unmask(m[15], held),
      m[16] === undefined ? "" : unmask(m[16], held),
    );
  if (m[13] !== undefined) return lifted[Number(m[13])] ?? null;
  if (m[12] !== undefined) {
    const url = unmask(m[12], held);
    return {
      type: "link",
      url,
      children: [{ type: "text", value: url }],
      auto: true,
    };
  }
  return {
    type: "link",
    url: unmask(m[11] ?? "", held),
    children: inner(m[10] ?? ""),
  };
}

function parseInlineMasked(
  src: string,
  held: string[],
  lifted: readonly Inline[],
): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  let linked = rest.includes("](");
  const reaches = reachesOf(src);
  for (;;) {
    const m = tokenFor(liveSpans(rest, reaches), linked).exec(rest);
    if (!m) break;
    appendText(out, rest.slice(0, m.index), held);
    const node = tokenNode(m, held, lifted);
    if (node) out.push(node);
    rest = rest.slice(m.index + m[0].length);
    if (linked) linked = rest.includes("](");
  }
  appendText(out, rest, held);
  return out;
}

const INLINE_BREAK = /(`+)[\s\S]*?\1|\s*\\(?:\s+|(?=\p{L})(?![A-Za-z])|\s*$)/gu;

export function parseInline(src: string): Inline[] {
  return inlineOf(src, false);
}

function liftSpan(match: RegExpExecArray, lifted: Inline[]): string {
  const [whole, , env, paren, double, single, blank] = match;
  if (blank !== undefined) {
    lifted.push({ type: "blank", width: blank.length });
    return MATH_HOLD + (lifted.length - 1) + MATH_HOLD;
  }
  const open: MathOpen | null =
    env !== undefined
      ? "\\begin{math}"
      : paren !== undefined
        ? "\\("
        : double !== undefined
          ? "$$"
          : single !== undefined
            ? "$"
            : null;
  if (open === null) return whole;
  if (open === "$" && !dollarMath(single ?? "")) return whole;
  lifted.push({
    type: "math",
    open,
    value: env ?? paren ?? double ?? single ?? "",
  });
  return MATH_HOLD + (lifted.length - 1) + MATH_HOLD;
}

function liftSpans(src: string, lifted: Inline[]): string {
  let out = "";
  let from = 0;
  for (const match of spansOf(src, MATH)) {
    out += src.slice(from, match.index) + liftSpan(match, lifted);
    from = match.index + match[0].length;
  }
  return out + src.slice(from);
}

function hardBreaks(masked: string): string {
  return masked.replace(
    INLINE_BREAK,
    (whole, ticks: string | undefined, at: number, all: string) =>
      ticks !== undefined
        ? whole
        : at + whole.length === all.length
          ? ""
          : HARD + "\n",
  );
}

export function inlineOf(src: string, breaks: boolean): Inline[] {
  const held: string[] = [];
  const lifted: Inline[] = [];
  const clean = src.replace(/[\u0001\u0002\u0004]/g, "");
  const masked = mask(liftSpans(clean, lifted), held);
  return parseInlineMasked(
    maskBrackets(breaks ? hardBreaks(masked) : masked),
    held,
    lifted,
  );
}
