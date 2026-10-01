export type MathOpen = "$" | "$$" | "\\(" | "\\begin{math}";

const MATH_SHUT: Readonly<Record<MathOpen, string>> = {
  $: "$",
  $$: "$$",
  "\\(": "\\)",
  "\\begin{math}": "\\end{math}",
};

export function mathSource(open: MathOpen, value: string): string {
  return open + value + MATH_SHUT[open];
}

export type TexLogo = "TeX" | "LaTeX" | "LaTeXe";

const TEX_LOGO = /\\(LaTeXe|LaTeX|TeX)(?![A-Za-z])(?:\{\})?/g;

const TEXT_TOKEN = /\\(LaTeXe|LaTeX|TeX|today)(?![A-Za-z])(?:\{\})?/g;

export function todayText(date: Date = new Date()): string {
  return (
    String(date.getFullYear()) +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function withLogos(
  text: string,
  logo: (name: TexLogo) => string,
  plain: (part: string) => string,
): string {
  let out = "";
  let from = 0;
  let pending = "";
  for (const match of text.matchAll(TEXT_TOKEN)) {
    pending += text.slice(from, match.index);
    from = match.index + match[0].length;
    if (match[1] === "today") {
      pending += todayText();
      continue;
    }
    out += plain(pending) + logo(match[1] as TexLogo);
    pending = "";
  }
  return out + plain(pending + text.slice(from));
}

export function textLogos(value: string): string {
  return value.replace(TEX_LOGO, "\\text{\\$1}");
}

const LOGO_HTML: Readonly<Record<TexLogo, string>> = {
  TeX: 'T<span class="tex-e">E</span>X',
  LaTeX: 'L<span class="tex-a">A</span>T<span class="tex-e">E</span>X',
  LaTeXe:
    'L<span class="tex-a">A</span>T<span class="tex-e">E</span>X2<span class="tex-eps">ε</span>',
};

export const LOGO_TEXT: Readonly<Record<TexLogo, string>> = {
  TeX: "TeX",
  LaTeX: "LaTeX",
  LaTeXe: "LaTeX2ε",
};

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "math"; open: MathOpen; value: string }
  | { type: "blank"; width: number; fit?: number; fill?: boolean }
  | { type: "softbreak" }
  | { type: "break" }
  | { type: "strong"; children: Inline[] }
  | { type: "del"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; url: string; children: Inline[]; auto?: boolean }
  | {
      type: "image";
      alt: string;
      src: string;
      width?: number;
      rotate?: number;
    };

export interface Heading {
  type: "heading";
  depth: number;
  children: Inline[];
  attrs?: string;
  line: number;
}
export interface MetaField {
  readonly key: string;
  readonly value: string;
}
export interface MetaBlock {
  type: "meta";
  fields: MetaField[];
  raw: string;
  line: number;
}
export interface DivBlock {
  type: "div";
  fence: string;
  attrs: string;
  classes: string[];
  keys: Record<string, string>;
  children: Block[];
  line: number;
}
export interface Paragraph {
  type: "paragraph";
  children: Inline[];
  line: number;
}
export interface Quote {
  type: "quote";
  children: Block[];
  line: number;
}
export interface ListNode {
  type: "list";
  ordered: boolean;
  start: number;
  items: Inline[][];
  line: number;
}
export interface CodeBlock {
  type: "codeblock";
  lang: string;
  value: string;
  line: number;
}
export interface MathBlock {
  type: "math";
  fence: "$$" | "\\[" | "env";
  value: string;
  line: number;
}
export interface LatexBlock {
  type: "latex";
  env: string;
  value: string;
  line: number;
}
export interface Rule {
  type: "rule";
  line: number;
}
export interface PageBreak {
  type: "pagebreak";
  line: number;
}
export interface Table {
  type: "table";
  align: (("left" | "right" | "center") | null)[];
  rows: Inline[][][];
  line: number;
}

export type Block =
  | Heading
  | Paragraph
  | Quote
  | ListNode
  | CodeBlock
  | MathBlock
  | LatexBlock
  | MetaBlock
  | DivBlock
  | Rule
  | PageBreak
  | Table;

const HOLD = "\u0001";

const MATH_HOLD = "\u0002";

const HARD = "\u0003";

const MATH_SPAN =
  /(`+)[\s\S]*?\1|\\begin\{math\}([\s\S]*?)\\end\{math\}|\\\(([\s\S]*?)\\\)|\\[\s\S]|\$\$((?:[^$\\]|\\.)+?)\$\$|(?<!\$)\$(?![\s$])((?:[^$\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?![\d$])|(?<![\p{L}\p{N}_])(_{3,})(?![\p{L}\p{N}_])/gu;

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
    "\\[([^\\]]*)\\]\\(([^)\\s]*)\\)",
    "<((?:[a-z][a-z0-9+.-]*:|[^\\s<>@]+@)[^\\s<>]+)>",
    MATH_HOLD + "(\\d+)" + MATH_HOLD,
    "!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)(?:\\{([^{}]*)\\})?",
  ].join("|"),
  "iu",
);

function imageNode(alt: string, src: string, attrs: string): Inline {
  const { keys } = parseAttrs("{" + attrs + "}");
  const node: Inline & { type: "image" } = { type: "image", alt, src };
  const width = /^(\d+(?:\.\d+)?)%$/.exec(keys["width"] ?? "")?.[1];
  if (width !== undefined && Number(width) > 0)
    node.width = Math.min(100, Number(width));
  const rotate = (((Number(keys["rotate"]) || 0) % 360) + 360) % 360;
  if (rotate % 90 === 0 && rotate !== 0) node.rotate = rotate;
  return node;
}

export function imageAttrs(node: {
  readonly width?: number;
  readonly rotate?: number;
}): string {
  const parts = [
    node.width === undefined ? "" : "width=" + String(node.width) + "%",
    node.rotate === undefined ? "" : "rotate=" + String(node.rotate),
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

function inlineOf(src: string, breaks: boolean): Inline[] {
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

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const PAGEBREAK_RE = /^\s*\\newpage\s*$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/;
const MATH_RE = /^\s*(?:\$\$|\\\[|\\begin\{[A-Za-z]+\*?\})/;

const MATH_ENVS = new Set(
  [
    "equation",
    "align",
    "gather",
    "multline",
    "displaymath",
    "flalign",
    "alignat",
    "aligned",
    "gathered",
    "split",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "smallmatrix",
  ].flatMap((name) => [name, name + "*"]),
);

const TEXT_ENVS = new Set([
  "itemize",
  "enumerate",
  "description",
  "tabular",
  "table",
  "figure",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "verbatim",
  "abstract",
  "proof",
  "theorem",
  "definition",
]);

const MATH_CLOSE = { $$: "$$", "\\[": "\\]" } as const;

function envEnd(
  lines: readonly string[],
  start: number,
  env: string,
  math: boolean,
): number {
  const verbatim = env === "verbatim";
  const edge = verbatim
    ? /\\end\{verbatim\}/g
    : new RegExp("\\\\(begin|end)\\{" + env.replace("*", "\\*") + "\\}", "g");
  let depth = verbatim ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const line =
      verbatim && i === start ? raw.slice(raw.indexOf("}") + 1) : raw;
    if (math && i > start && !line.trim()) return -1;
    for (const m of line.matchAll(edge)) {
      depth += m[1] === "begin" ? 1 : -1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function displayMath(
  lines: readonly string[],
  start: number,
): { block: MathBlock | LatexBlock; next: number } | null {
  const head = lines[start]!.trim();
  const env = /^\\begin\{([A-Za-z]+\*?)\}/.exec(head)?.[1];
  if (env !== undefined) {
    const math = MATH_ENVS.has(env);
    if (!math && !TEXT_ENVS.has(env)) return null;
    const end = envEnd(lines, start, env, math);
    if (end < 0) return null;
    const value = lines
      .slice(start, end + 1)
      .join("\n")
      .trim();
    return {
      block: math
        ? { type: "math", fence: "env", value, line: start }
        : { type: "latex", env, value, line: start },
      next: end + 1,
    };
  }

  const fence: "$$" | "\\[" = head.startsWith("$$") ? "$$" : "\\[";
  const close = MATH_CLOSE[fence];
  let body = head.slice(2);
  const inner = body.indexOf(close);
  if (inner >= 0 && inner + close.length < body.length) return null;

  let i = start + 1;
  while (!body.endsWith(close)) {
    const line = lines[i]?.trimEnd();
    if (line === undefined || !line.trim()) return null;
    body += "\n" + line;
    i += 1;
  }
  return {
    block: {
      type: "math",
      fence,
      value: body.slice(0, -close.length).trim(),
      line: start,
    },
    next: i,
  };
}

const AUTO_BLANK = 4;

function plainInline(nodes: readonly Inline[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "code" || node.type === "math")
      out += node.value;
    else if (node.type === "blank") out += "_".repeat(node.width);
    else if (node.type === "image") out += node.alt;
    else if (
      node.type === "strong" ||
      node.type === "em" ||
      node.type === "del" ||
      node.type === "link"
    )
      out += plainInline(node.children);
  }
  return out;
}

function splitLines(nodes: readonly Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const node of nodes)
    if (node.type === "break" || node.type === "softbreak") lines.push([]);
    else lines.at(-1)!.push(node);
  return lines;
}

function hasAutoBlank(nodes: readonly Inline[]): boolean {
  return nodes.some(
    (node) =>
      (node.type === "blank" &&
        node.width === AUTO_BLANK &&
        node.fit === undefined &&
        !node.fill) ||
      ("children" in node && hasAutoBlank(node.children)),
  );
}

function valueWidth(lines: readonly Inline[][]): number | null {
  let width = 0;
  for (const line of lines) {
    if (hasAutoBlank(line)) continue;
    const text = plainInline(line);
    const at = text.indexOf(":");
    if (at >= 0) width = Math.max(width, text.slice(at + 1).trim().length);
  }
  return width > 0 ? width : null;
}

function resizeBlanks(nodes: readonly Inline[], width: number): Inline[] {
  return nodes.map((node) => {
    if (
      node.type === "blank" &&
      node.width === AUTO_BLANK &&
      !node.fit &&
      !node.fill
    )
      return width === 0
        ? { type: "blank", width: AUTO_BLANK, fill: true }
        : { type: "blank", width: AUTO_BLANK, fit: width };
    if (
      node.type === "strong" ||
      node.type === "em" ||
      node.type === "del" ||
      node.type === "link"
    )
      return { ...node, children: resizeBlanks(node.children, width) };
    return node;
  });
}

export function fitBlanks(blocks: readonly Block[]): Block[] {
  return blocks.map((block): Block => {
    if (block.type === "paragraph") {
      if (!hasAutoBlank(block.children)) return block;
      const width = valueWidth(splitLines(block.children));
      return width === null
        ? block
        : { ...block, children: resizeBlanks(block.children, width) };
    }
    if (block.type === "quote")
      return { ...block, children: fitBlanks(block.children) };
    if (block.type === "table")
      return {
        ...block,
        rows: block.rows.map((row) =>
          row.map((cell) =>
            hasAutoBlank(cell) ? resizeBlanks(cell, 0) : cell,
          ),
        ),
      };
    if (block.type !== "div") return block;
    const children = fitBlanks(block.children);
    const width = valueWidth(
      children.flatMap((child) =>
        child.type === "paragraph" ? splitLines(child.children) : [],
      ),
    );
    return {
      ...block,
      children:
        width === null
          ? children
          : children.map((child) =>
              child.type === "paragraph"
                ? { ...child, children: resizeBlanks(child.children, width) }
                : child,
            ),
    };
  });
}

export function blankEm(blank: { width: number; fit?: number }): number {
  return blank.fit === undefined ? blank.width / 2 : blank.fit * 0.55;
}

export function blankUnderscores(blank: {
  width: number;
  fit?: number;
  fill?: boolean;
}): number {
  if (blank.fill) return 0;
  return blank.fit === undefined ? blank.width : Math.round(blank.fit * 1.5);
}

export function cellFills(cell: readonly Inline[]): boolean {
  return cell.some((node) => node.type === "blank" && node.fill === true);
}

export function isBlankRow(row: readonly Inline[][] | undefined): boolean {
  return (row ?? []).every((cell) =>
    cell.every((node) => node.type === "text" && !node.value.trim()),
  );
}

const DIV_OPEN = /^\s{0,3}(:{3,})\s*(\{[^{}]*\}|[^\s{}:]+)\s*:*\s*$/;
const DIV_CLOSE = /^\s{0,3}:{3,}\s*$/;
const META_EDGE = /^(?:---|\.\.\.)$/;
const META_FIELD = /^([A-Za-z][\w-]*):[ \t]*(.*)$/;
const HEADING_ATTRS = /^([\s\S]*?)\s+(\{\s*(?:[.#-]|[\w-]+=)[^{}]*\})\s*$/;

interface Attrs {
  readonly classes: string[];
  readonly keys: Record<string, string>;
}

function parseAttrs(text: string): Attrs {
  const inner = text.startsWith("{") ? text.slice(1, -1) : "." + text;
  const classes: string[] = [];
  const keys: Record<string, string> = {};
  const token =
    /\.([\w-]+)|#([\w-]+)|([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))|(^|\s)-(?=\s|$)/g;
  for (const m of inner.matchAll(token)) {
    if (m[1]) classes.push(m[1]);
    else if (m[2]) keys["id"] = m[2];
    else if (m[3]) keys[m[3]] = m[4] ?? m[5] ?? m[6] ?? "";
    else classes.push("unnumbered");
  }
  return { classes, keys };
}

export function headingClasses(heading: Heading): string[] {
  return heading.attrs ? parseAttrs(heading.attrs).classes : [];
}

function unquote(value: string): string {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2]!.replace(/\\(["'\\])/g, "$1") : value;
}

function metaBlock(
  lines: readonly string[],
): { block: MetaBlock; next: number } | null {
  if (lines[0]?.trim() !== "---") return null;
  const fields: MetaField[] = [];
  let i = 1;
  while (i < lines.length && !META_EDGE.test(lines[i]!.trim())) {
    const m = META_FIELD.exec(lines[i]!);
    if (!m) return null;
    fields.push({ key: m[1]!, value: unquote(m[2]!.trim()) });
    i += 1;
  }
  if (i >= lines.length || !fields.length) return null;
  return {
    block: {
      type: "meta",
      fields,
      raw: lines.slice(0, i + 1).join("\n"),
      line: 0,
    },
    next: i + 1,
  };
}

function divEnd(lines: readonly string[], start: number): number {
  let depth = 0;
  let fence = "";
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (line.trim().startsWith(fence)) fence = "";
      continue;
    }
    if (fence) continue;
    if (DIV_OPEN.test(line)) depth += 1;
    else if (DIV_CLOSE.test(line)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function withoutDivs(src: string): string {
  const lines = src.split("\n");
  const drop = new Set<number>();
  let fence = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (line.trim().startsWith(fence)) fence = "";
      continue;
    }
    if (fence || drop.has(i)) continue;
    const open = DIV_OPEN.exec(line);
    if (!open) continue;
    const end = divEnd(lines, i);
    if (end < 0) continue;
    if (parseAttrs(open[2]!).classes.includes("notes")) {
      for (let j = i; j <= end; j += 1) drop.add(j);
      i = end;
    } else {
      drop.add(i);
      drop.add(end);
    }
  }
  const out: string[] = [];
  let gap = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (drop.has(i)) {
      gap = true;
      continue;
    }
    const blank = !line.trim();
    if (gap && !blank && out.length > 0 && out.at(-1)!.trim()) out.push("");
    if (!(gap && blank && (out.length === 0 || !out.at(-1)!.trim())))
      out.push(line);
    gap = false;
  }
  while (out.length > 0 && !out.at(-1)!.trim() && lines.at(-1)!.trim())
    out.pop();
  return out.join("\n");
}

export function metaValue(
  block: Block | undefined,
  key: string,
): string | undefined {
  if (block?.type !== "meta") return undefined;
  return block.fields.find((field) => field.key === key)?.value;
}

function splitCells(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  if (cells[0]?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(cell: string): "left" | "right" | "center" | null {
  const s = cell.replace(/\s/g, "");
  if (!/^:?-+:?$/.test(s)) return null;
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function headingContinues(line: string | undefined): boolean {
  if (line === undefined || !line.trim()) return false;
  const text = line.trimEnd();
  return !(
    HEADING_RE.test(text) ||
    RULE_RE.test(text) ||
    BULLET_RE.test(text) ||
    ORDERED_RE.test(text) ||
    QUOTE_RE.test(text) ||
    FENCE_RE.test(text) ||
    MATH_RE.test(text) ||
    DIV_OPEN.test(text)
  );
}

function isDivider(line: string | undefined): boolean {
  if (line === undefined || !line.includes("-")) return false;
  const cells = splitCells(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")))
  );
}

export function parse(src: string): Block[] {
  return parseBlocks(src, true);
}

function parseBlocks(src: string, top: boolean): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  const meta = top ? metaBlock(lines) : null;
  if (meta) {
    out.push(meta.block);
    i = meta.next;
  }

  const paragraph = (): void => {
    const start = i;
    const buf: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!.trimEnd();
      if (
        !line.trim() ||
        HEADING_RE.test(line) ||
        RULE_RE.test(line) ||
        BULLET_RE.test(line) ||
        ORDERED_RE.test(line) ||
        QUOTE_RE.test(line) ||
        FENCE_RE.test(line) ||
        (i > start && MATH_RE.test(line) && displayMath(lines, i)) ||
        (DIV_OPEN.test(line) && divEnd(lines, i) >= 0)
      )
        break;
      buf.push(lines[i]!);
      i += 1;
    }
    if (buf.length)
      out.push({
        type: "paragraph",
        children: parseInline(
          buf
            .map((raw, index) => {
              const text = raw.trim();
              if (index === buf.length - 1) return text;
              if (/ {2,}$/.test(raw)) return text + HARD;
              const slashes = /\\+$/.exec(text)?.[0].length ?? 0;
              return slashes % 2 === 1 ? text.slice(0, -1) + HARD : text;
            })
            .join("\n"),
        ),
        line: start,
      });
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const start = i;
      const marker = fence[1]!;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimEnd().startsWith(marker)) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1;
      out.push({
        type: "codeblock",
        lang: fence[2] ?? "",
        value: body.join("\n"),
        line: start,
      });
      continue;
    }

    const divOpen = DIV_OPEN.exec(line);
    const divClose = divOpen ? divEnd(lines, i) : -1;
    if (divOpen && divClose >= 0) {
      const attrs = divOpen[2]!;
      out.push({
        type: "div",
        fence: divOpen[1]!,
        attrs,
        ...parseAttrs(attrs),
        children: parseBlocks(lines.slice(i + 1, divClose).join("\n"), false),
        line: i,
      });
      i = divClose + 1;
      continue;
    }

    const math = MATH_RE.test(line) ? displayMath(lines, i) : null;
    if (math) {
      out.push(math.block);
      i = math.next;
      continue;
    }

    if (line.includes("|") && isDivider(lines[i + 1])) {
      const start = i;
      const header = splitCells(line);
      const align = splitCells(lines[i + 1]!).map(alignOf);
      const rows: Inline[][][] = [header.map(parseInline)];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|")) {
        rows.push(splitCells(lines[i]!).map(parseInline));
        i += 1;
      }
      out.push({ type: "table", align, rows, line: start });
      continue;
    }

    const head = HEADING_RE.exec(line);
    if (head) {
      const start = i;
      let text = head[2]!;
      while (
        (/\\+$/.exec(text)?.[0].length ?? 0) % 2 === 1 &&
        headingContinues(lines[i + 1])
      ) {
        i += 1;
        text = text.slice(0, -1) + HARD + "\n" + lines[i]!.trim();
      }
      const withAttrs = HEADING_ATTRS.exec(text);
      out.push({
        type: "heading",
        depth: head[1]!.length,
        children: inlineOf(withAttrs ? withAttrs[1]! : text, true),
        ...(withAttrs ? { attrs: withAttrs[2]! } : {}),
        line: start,
      });
      i += 1;
      continue;
    }

    if (PAGEBREAK_RE.test(line)) {
      out.push({ type: "pagebreak", line: i });
      i += 1;
      continue;
    }

    if (RULE_RE.test(line)) {
      out.push({ type: "rule", line: i });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const start = i;
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        body.push(QUOTE_RE.exec(lines[i]!)![1]!);
        i += 1;
      }
      out.push({
        type: "quote",
        children: parseBlocks(body.join("\n"), false),
        line: start,
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (bullet || ordered) {
      const start = i;
      const isOrdered = !!ordered;
      const first = Number(ordered?.[2] ?? 1);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const b = BULLET_RE.exec(lines[i]!);
        const o = ORDERED_RE.exec(lines[i]!);
        const hit = isOrdered ? o : b;
        if (!hit) break;
        items.push(parseInline(hit[3]!));
        i += 1;
      }
      out.push({
        type: "list",
        ordered: isOrdered,
        start: first,
        items,
        line: start,
      });
      continue;
    }

    const before = i;
    paragraph();
    if (i === before) i += 1;
  }

  return out;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function inlineHtml(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text")
      out += withLogos(
        n.value,
        (name) => `<span class="tex-logo">${LOGO_HTML[name]}</span>`,
        esc,
      );
    else if (n.type === "code") out += `<code>${esc(n.value)}</code>`;
    else if (n.type === "math")
      out +=
        `<span class="math${n.open === "$$" ? " math-display" : ""}">` +
        `${esc(n.value)}</span>`;
    else if (n.type === "blank")
      out += n.fill
        ? `<span class="blank fill"></span>`
        : `<span class="blank" style="--blank:${blankEm(n) * 2}"></span>`;
    else if (n.type === "softbreak") out += "\n";
    else if (n.type === "break") out += "<br>";
    else if (n.type === "strong")
      out += `<strong>${inlineHtml(n.children)}</strong>`;
    else if (n.type === "em") out += `<em>${inlineHtml(n.children)}</em>`;
    else if (n.type === "del") out += `<del>${inlineHtml(n.children)}</del>`;
    else if (n.type === "image")
      out +=
        `<img class="md-image" data-src="${esc(n.src)}" alt="${esc(n.alt)}"` +
        (n.width === undefined ? "" : ` style="width:${n.width}%"`) +
        (n.rotate === undefined ? "" : ` data-rotate="${n.rotate}"`) +
        `>`;
    else
      out +=
        `<a href="${esc(n.url)}" rel="noopener noreferrer" target="_blank">` +
        `${inlineHtml(n.children)}</a>`;
  }
  return out;
}

export function toHtml(blocks: readonly Block[]): string {
  let out = "";
  for (const b of blocks) {
    const at = ` data-line="${b.line}"`;
    if (b.type === "heading")
      out += `<h${b.depth}${at}>${inlineHtml(b.children)}</h${b.depth}>`;
    else if (b.type === "paragraph")
      out += `<p${at}>${inlineHtml(b.children)}</p>`;
    else if (b.type === "rule") out += `<hr${at}>`;
    else if (b.type === "pagebreak") out += `<hr class="page-break"${at}>`;
    else if (b.type === "codeblock")
      out += `<pre${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "math")
      out += `<div class="math math-display"${at}>${esc(b.value)}</div>`;
    else if (b.type === "latex")
      out += `<pre class="latex"${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "meta")
      out +=
        `<div class="md-meta"${at}>` +
        b.fields
          .map(
            (field) =>
              `<p class="md-meta-${esc(field.key)}">${esc(field.value)}</p>`,
          )
          .join("") +
        `</div>`;
    else if (b.type === "div") {
      const width = /^\d+(?:\.\d+)?%$/.test(b.keys["width"] ?? "")
        ? ` style="flex-basis:${b.keys["width"]}"`
        : "";
      const kind = b.classes.includes("notes")
        ? "md-notes"
        : b.classes.includes("columns")
          ? "md-columns"
          : b.classes.includes("column")
            ? "md-column"
            : "md-div";
      const align = ["right", "center", "left", "signature"]
        .filter((name) => b.classes.includes(name))
        .map((name) => " md-" + name)
        .join("");
      out += `<div class="${kind}${align}"${width}${at}>${toHtml(b.children)}</div>`;
    } else if (b.type === "quote")
      out += `<blockquote${at}>${toHtml(b.children)}</blockquote>`;
    else if (b.type === "list") {
      const tag = b.ordered ? "ol" : "ul";
      const startAttr = b.ordered && b.start !== 1 ? ` start="${b.start}"` : "";
      out +=
        `<${tag}${startAttr}${at}>` +
        b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("") +
        `</${tag}>`;
    } else {
      const [header, ...body] = b.rows;
      const style = (i: number): string =>
        b.align[i] ? ` style="text-align:${b.align[i]}"` : "";
      out +=
        `<table${at}>` +
        (isBlankRow(header)
          ? ""
          : `<thead><tr>` +
            (header ?? [])
              .map((c, i) => `<th${style(i)}>${inlineHtml(c)}</th>`)
              .join("") +
            `</tr></thead>`) +
        `<tbody>` +
        body
          .map(
            (r) =>
              `<tr>${r.map((c, i) => `<td${style(i)}>${inlineHtml(c)}</td>`).join("")}</tr>`,
          )
          .join("") +
        `</tbody></table>`;
    }
  }
  return out;
}

const MAX_ALIGN_ROW = 100;

function escapeText(s: string, cell: boolean, full: boolean): string {
  if (!full) return cell ? s.replace(/\|/g, "\\|") : s;
  let out = s.replace(/([\\`*_[\]$~<])/g, "\\$1");
  if (cell) out = out.replace(/\|/g, "\\|");
  return out;
}

function escapeLeading(s: string): string {
  if (RULE_RE.test(s)) return s.replace(/^(\s*)/, "$1\\");
  return s.replace(
    /^(\s*)(>|#{1,6}\s|[-*+]\s|\d+[.)]\s)/,
    (_, space: string, marker: string) => space + "\\" + marker,
  );
}

function withoutLines(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) =>
    key === "line" ? undefined : item,
  );
}

function inlineOut(
  nodes: readonly Inline[],
  cell: boolean,
  full: boolean,
): string {
  if (!full) {
    const light = inlineMd(nodes, cell, false);
    if (withoutLines(parseInline(light)) === withoutLines(nodes)) return light;
  }
  return inlineMd(nodes, cell, true);
}

function inlineMd(
  nodes: readonly Inline[],
  cell: boolean,
  full: boolean,
): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += escapeText(n.value, cell, full);
    else if (n.type === "code") {
      const ticks = "`".repeat((n.value.match(/`+/g)?.[0]?.length ?? 0) + 1);
      const pad = n.value.startsWith("`") || n.value.endsWith("`") ? " " : "";
      out += ticks + pad + n.value + pad + ticks;
    } else if (n.type === "math") out += mathSource(n.open, n.value);
    else if (n.type === "blank") out += "_".repeat(n.width);
    else if (n.type === "softbreak") out += "\n";
    else if (n.type === "break") out += "\\\n";
    else if (n.type === "strong")
      out += `**${inlineMd(n.children, cell, full)}**`;
    else if (n.type === "em") out += `*${inlineMd(n.children, cell, full)}*`;
    else if (n.type === "del") out += `~~${inlineMd(n.children, cell, full)}~~`;
    else if (n.type === "image")
      out += `![${escapeText(n.alt, cell, full)}](${n.src})${imageAttrs(n)}`;
    else if (n.auto) out += `<${n.url}>`;
    else out += `[${inlineMd(n.children, cell, full)}](${n.url})`;
  }
  return out;
}

function fenceFor(value: string): string {
  const longest =
    value
      .match(/`{3,}/g)
      ?.reduce((a, b) => (b.length > a.length ? b : a), "```") ?? "```";
  return "`".repeat(Math.max(3, longest.length + 1));
}

function blockMd(b: Block, full: boolean): string {
  switch (b.type) {
    case "heading":
      return (
        "#".repeat(b.depth) +
        " " +
        inlineOut(b.children, false, full).replace(/\\\n/g, " \\ ") +
        (b.attrs ? " " + b.attrs : "")
      );
    case "paragraph":
      return inlineOut(b.children, false, full)
        .split("\n")
        .map(escapeLeading)
        .join("\n");
    case "rule":
      return "---";
    case "pagebreak":
      return "\\newpage";
    case "codeblock": {
      const f = fenceFor(b.value);
      return f + b.lang + "\n" + b.value + "\n" + f;
    }
    case "latex":
      return b.value;
    case "meta":
      return b.raw;
    case "div":
      return (
        b.fence +
        " " +
        b.attrs +
        "\n" +
        b.children.map((inner) => blockMd(inner, full)).join("\n\n") +
        "\n" +
        b.fence
      );
    case "math":
      if (b.fence === "env") return b.value;
      if (!b.value) return b.fence + MATH_CLOSE[b.fence];
      return b.fence + "\n" + b.value + "\n" + MATH_CLOSE[b.fence];
    case "quote":
      return b.children
        .map((inner) => blockMd(inner, full))
        .join("\n\n")
        .split("\n")
        .map((l) => (l ? "> " + l : ">"))
        .join("\n");
    case "list":
      return b.items
        .map((it, i) => {
          const marker = b.ordered ? `${b.start + i}.` : "-";
          return marker + " " + inlineOut(it, false, full);
        })
        .join("\n");
    case "table": {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      const cells = b.rows.map((r) =>
        Array.from({ length: width }, (_, i) =>
          inlineOut(r[i] ?? [], true, full),
        ),
      );
      const natural = Array.from({ length: width }, (_, i) =>
        Math.max(3, ...cells.map((r) => r[i]!.length)),
      );
      const aligned =
        natural.reduce((sum, w) => sum + w + 3, 1) <= MAX_ALIGN_ROW;
      const widths = aligned ? natural : natural.map(() => 3);
      const pad = (s: string, i: number): string => {
        if (!aligned) return s;
        const room = widths[i]! - s.length;
        if (room <= 0) return s;
        if (b.align[i] === "right") return s.padStart(widths[i]!);
        if (b.align[i] === "center") {
          const left = Math.floor(room / 2);
          return " ".repeat(left) + s + " ".repeat(room - left);
        }
        return s.padEnd(widths[i]!);
      };
      const divider = Array.from({ length: width }, (_, i) => {
        const a = b.align[i];
        const bar = "-".repeat(
          Math.max(1, widths[i]! - (a === "center" ? 2 : a ? 1 : 0)),
        );
        if (a === "center") return ":" + bar + ":";
        if (a === "right") return bar + ":";
        if (a === "left") return ":" + bar;
        return bar;
      });
      const row = (r: string[]): string => "| " + r.map(pad).join(" | ") + " |";
      const [head, ...body] = cells;
      return [
        row(head ?? []),
        "| " + divider.join(" | ") + " |",
        ...body.map(row),
      ].join("\n");
    }
  }
}

function render(blocks: readonly Block[], full: boolean): string {
  return (
    blocks.map((block) => blockMd(block, full)).join("\n\n") +
    (blocks.length ? "\n" : "")
  );
}

export function print(blocks: readonly Block[]): string {
  const light = render(blocks, false);
  if (withoutLines(parse(light)) === withoutLines(blocks)) return light;
  return render(blocks, true);
}

export function format(
  src: string,
  blocks: readonly Block[] = parse(src),
): string {
  const out = print(blocks);
  return withoutLines(parse(out)) === withoutLines(blocks) ? out : src;
}

function hasInlineMarkup(nodes: readonly Inline[]): boolean {
  return nodes.some(
    (n) =>
      n.type !== "text" &&
      n.type !== "blank" &&
      n.type !== "softbreak" &&
      n.type !== "break",
  );
}

export function isMarkdown(blocks: readonly Block[]): boolean {
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
      case "codeblock":
      case "math":
      case "latex":
      case "meta":
      case "div":
      case "table":
      case "quote":
      case "rule":
      case "pagebreak":
        return true;
      case "list":
        if (b.items.some(hasInlineMarkup)) return true;
        break;
      case "paragraph":
        if (hasInlineMarkup(b.children)) return true;
        break;
    }
  }
  return false;
}
