import { dollarMath } from "../spell/codeskip.ts";
import { type Inline } from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { type MathOpen } from "./texlogo.ts";

const HOLD = "\u0001";

const MATH_HOLD = "\u0002";

export const HARD = "\u0003";

const MATH_SPAN =
  /(`+)[\s\S]*?\1|\\begin\{math\}([\s\S]*?)\\end\{math\}|\\\(([\s\S]*?)\\\)|\\[\s\S]|\$\$((?:[^$\\]|\\.)+?)\$\$|(?<![$\d])\$(?![\s$])((?:[^$\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?![\d$])|(?<![\p{L}\p{N}_])(_{3,})(?![\p{L}\p{N}_])/gu;

const ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

function mask(src: string, held: string[]): string {
  return src.replace(/\\(.)/g, (whole, ch: string) => {
    if (!ESCAPABLE.includes(ch)) return whole;
    held.push(ch);
    return HOLD + (held.length - 1) + HOLD;
  });
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

const TOKEN = new RegExp(
  [
    "(`+)([\\s\\S]*?)\\1",
    emphasis("~", 2, "[\\s\\S]+?"),
    emphasis("\\*", 3, "[\\s\\S]+?"),
    wordBound(emphasis("_", 3, "[\\s\\S]+?")),
    emphasis("\\*", 2, "[\\s\\S]+?"),
    wordBound(emphasis("_", 2, "[\\s\\S]+?")),
    emphasis("\\*", 1, "[^*]+?"),
    wordBound(emphasis("_", 1, "[^_]+?")),
    "\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))*)\\)",
    "<((?:[a-z][a-z0-9+.-]*:|[^\\s<>@]+@)[^\\s<>]+)>",
    MATH_HOLD + "(\\d+)" + MATH_HOLD,
    "!\\[([^\\]]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)(?:\\{([^{}]*)\\})?",
  ].join("|"),
  "iu",
);

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

function parseInlineMasked(
  src: string,
  held: string[],
  lifted: readonly Inline[],
): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const pushText = (s: string): void => {
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
  };

  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) break;
    pushText(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      out.push({
        type: "code",
        value: unmask(m[2].replace(/\n/g, " ").trim(), held, true),
      });
    } else if (m[3] !== undefined) {
      out.push({
        type: "del",
        children: parseInlineMasked(m[3], held, lifted),
      });
    } else if (m[4] ?? m[5]) {
      out.push({
        type: "strong",
        children: [
          {
            type: "em",
            children: parseInlineMasked((m[4] ?? m[5])!, held, lifted),
          },
        ],
      });
    } else if (m[6] ?? m[7]) {
      out.push({
        type: "strong",
        children: parseInlineMasked((m[6] ?? m[7])!, held, lifted),
      });
    } else if (m[8] ?? m[9]) {
      out.push({
        type: "em",
        children: parseInlineMasked((m[8] ?? m[9])!, held, lifted),
      });
    } else if (m[15] !== undefined) {
      out.push(
        imageNode(
          unmask(m[14] ?? "", held),
          unmask(m[15], held),
          m[16] === undefined ? "" : unmask(m[16], held),
        ),
      );
    } else if (m[13] !== undefined) {
      const math = lifted[Number(m[13])];
      if (math) out.push(math);
    } else if (m[12] !== undefined) {
      const url = unmask(m[12], held);
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: url }],
        auto: true,
      });
    } else {
      out.push({
        type: "link",
        url: unmask(m[11] ?? "", held),
        children: parseInlineMasked(m[10] ?? "", held, lifted),
      });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  pushText(rest);
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
