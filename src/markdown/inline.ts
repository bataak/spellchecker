import { dollarMath } from "../spell/codeskip.ts";
import { type Inline } from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { type MathOpen } from "./texlogo.ts";

const HOLD = "\u0001";

const MATH_HOLD = "\u0002";

export const HARD = "\u0003";

const MATH_SPAN =
  /(`+)[\s\S]*?\1|\\begin\{math\}([\s\S]*?)\\end\{math\}|\\\(([\s\S]*?)\\\)|\\[\s\S]|\$\$((?:[^$\\]|\\.)+?)\$\$|(?<![$\d])\$(?![\s$])((?:[^$\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?![\d$])|(?<![\p{L}\p{N}_])(_{3,})(?![\p{L}\p{N}_])/gu;

const CELL_PIPE = new RegExp(MATH_SPAN.source + "|\\|", "gu");

export function splitPipes(line: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const match of line.matchAll(CELL_PIPE)) {
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

function unmask(src: string, held: string[], raw = false): string {
  return src.replace(new RegExp(HOLD + "(\\d+)" + HOLD, "g"), (_, i: string) =>
    held[Number(i)] === undefined ? "" : (raw ? "\\" : "") + held[Number(i)],
  );
}

const PUNCT = "\\p{P}\\p{S}\\u0001\\u0002";
const WORD = "\\p{L}\\p{N}";

const emphasis = (ch: string, n: number, body: string): string => {
  const run = ch.repeat(n);
  const opener =
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
    "))";
  const closer = "(?<!\\s)" + run;
  return opener + "(" + body + ")" + closer;
};

const wordBound = (pattern: string): string =>
  "(?<![" + WORD + "])" + pattern + "(?![" + WORD + "])";

const LINK = "\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))*)\\)";
const IMAGE =
  "!\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)(?:\\{([^{}]*)\\})?";
const NEVER = (pattern: string): string => pattern.replace("\\[", "\\[(?!)");

const tokenPattern = (link: string, image: string): RegExp =>
  new RegExp(
    [
      "(`+)([\\s\\S]*?)\\1",
      emphasis("~", 2, "[\\s\\S]+?"),
      emphasis("\\*", 3, "[\\s\\S]+?"),
      wordBound(emphasis("_", 3, "[\\s\\S]+?")),
      emphasis("\\*", 2, "[\\s\\S]+?"),
      wordBound(emphasis("_", 2, "[\\s\\S]+?")),
      emphasis("\\*", 1, "[^*]+?"),
      wordBound(emphasis("_", 1, "[^_]+?")),
      link,
      "<((?:[a-z][a-z0-9+.-]*:|[^\\s<>@]+@)[^\\s<>]+)>",
      MATH_HOLD + "(\\d+)" + MATH_HOLD,
      image,
    ].join("|"),
    "iu",
  );

const TOKEN = tokenPattern(LINK, IMAGE);
const TOKEN_NO_LINK = tokenPattern(NEVER(LINK), NEVER(IMAGE));

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
  for (;;) {
    const m = (linked ? TOKEN : TOKEN_NO_LINK).exec(rest);
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

export function inlineOf(src: string, breaks: boolean): Inline[] {
  const held: string[] = [];
  const lifted: Inline[] = [];
  const source = src
    .split(HOLD)
    .join("")
    .split(MATH_HOLD)
    .join("")
    .replace(
      MATH_SPAN,
      (
        whole,
        _ticks: string | undefined,
        env: string | undefined,
        paren: string | undefined,
        double: string | undefined,
        single: string | undefined,
        blank: string | undefined,
      ) => {
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
      },
    );
  const masked = mask(source, held);
  return parseInlineMasked(
    breaks
      ? masked.replace(
          INLINE_BREAK,
          (whole, ticks: string | undefined, at: number, all: string) =>
            ticks !== undefined
              ? whole
              : at + whole.length === all.length
                ? ""
                : HARD + "\n",
        )
      : masked,
    held,
    lifted,
  );
}
