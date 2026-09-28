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

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "math"; open: MathOpen; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "del"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; url: string; children: Inline[]; auto?: boolean };

export interface Heading {
  type: "heading";
  depth: number;
  children: Inline[];
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
  | Rule
  | Table;

const HOLD = "\u0001";

const MATH_HOLD = "\u0002";

const MATH_SPAN =
  /(`+)[\s\S]*?\1|\\begin\{math\}([\s\S]*?)\\end\{math\}|\\\(([\s\S]*?)\\\)|\$\$((?:[^$\\]|\\.)+?)\$\$|(?<![\\$])\$(?![\s$])((?:[^$\n\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?![\d$])/g;

const ESCAPABLE = "\\`*_{}[]()#+-.!|~>$";

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

const PUNCT = "\\p{P}\\p{S}";
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
    emphasis("\\*", 1, "[^*\\n]+?"),
    wordBound(emphasis("_", 1, "[^_\\n]+?")),
    "\\[([^\\]]*)\\]\\(([^)\\s]*)\\)",
    "<((?:[a-z][a-z0-9+.-]*:|[^\\s<>@]+@)[^\\s<>]+)>",
    MATH_HOLD + "(\\d+)" + MATH_HOLD,
  ].join("|"),
  "iu",
);

function parseInlineMasked(
  src: string,
  held: string[],
  maths: readonly Inline[],
): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const pushText = (s: string): void => {
    if (!s) return;
    const value = unmask(s, held);
    const last = out.at(-1);
    if (last?.type === "text") last.value += value;
    else out.push({ type: "text", value });
  };

  for (;;) {
    const m = TOKEN.exec(rest);
    if (!m) break;
    pushText(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      out.push({ type: "code", value: unmask(m[2].trim(), held, true) });
    } else if (m[3] !== undefined) {
      out.push({
        type: "del",
        children: parseInlineMasked(m[3], held, maths),
      });
    } else if (m[4] ?? m[5]) {
      out.push({
        type: "strong",
        children: [
          {
            type: "em",
            children: parseInlineMasked((m[4] ?? m[5])!, held, maths),
          },
        ],
      });
    } else if (m[6] ?? m[7]) {
      out.push({
        type: "strong",
        children: parseInlineMasked((m[6] ?? m[7])!, held, maths),
      });
    } else if (m[8] ?? m[9]) {
      out.push({
        type: "em",
        children: parseInlineMasked((m[8] ?? m[9])!, held, maths),
      });
    } else if (m[13] !== undefined) {
      const math = maths[Number(m[13])];
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
        children: parseInlineMasked(m[10] ?? "", held, maths),
      });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  pushText(rest);
  return out;
}

export function parseInline(src: string): Inline[] {
  const held: string[] = [];
  const maths: Inline[] = [];
  const lifted = src
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
      ) => {
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
        maths.push({
          type: "math",
          open,
          value: env ?? paren ?? double ?? single ?? "",
        });
        return MATH_HOLD + (maths.length - 1) + MATH_HOLD;
      },
    );
  return parseInlineMasked(mask(lifted, held), held, maths);
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
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
    const line = verbatim && i === start ? raw.slice(raw.indexOf("}") + 1) : raw;
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

function isDivider(line: string | undefined): boolean {
  if (line === undefined || !line.includes("-")) return false;
  const cells = splitCells(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")))
  );
}

export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

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
        (i > start && MATH_RE.test(line) && displayMath(lines, i))
      )
        break;
      buf.push(line.trim());
      i += 1;
    }
    if (buf.length)
      out.push({
        type: "paragraph",
        children: parseInline(buf.join(" ")),
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
      out.push({
        type: "heading",
        depth: head[1]!.length,
        children: parseInline(head[2]!),
        line: i,
      });
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
        children: parse(body.join("\n")),
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
    if (n.type === "text") out += esc(n.value);
    else if (n.type === "code") out += `<code>${esc(n.value)}</code>`;
    else if (n.type === "math")
      out +=
        `<span class="math${n.open === "$$" ? " math-display" : ""}">` +
        `${esc(n.value)}</span>`;
    else if (n.type === "strong")
      out += `<strong>${inlineHtml(n.children)}</strong>`;
    else if (n.type === "em") out += `<em>${inlineHtml(n.children)}</em>`;
    else if (n.type === "del") out += `<del>${inlineHtml(n.children)}</del>`;
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
    else if (b.type === "codeblock")
      out += `<pre${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "math")
      out += `<div class="math math-display"${at}>${esc(b.value)}</div>`;
    else if (b.type === "latex")
      out += `<pre class="latex"${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "quote")
      out += `<blockquote${at}>${toHtml(b.children)}</blockquote>`;
    else if (b.type === "list") {
      const tag = b.ordered ? "ol" : "ul";
      const startAttr =
        b.ordered && b.start !== 1 ? ` start="${b.start}"` : "";
      out +=
        `<${tag}${startAttr}${at}>` +
        b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("") +
        `</${tag}>`;
    } else {
      const [header, ...body] = b.rows;
      const style = (i: number): string =>
        b.align[i] ? ` style="text-align:${b.align[i]}"` : "";
      out +=
        `<table${at}><thead><tr>` +
        (header ?? [])
          .map((c, i) => `<th${style(i)}>${inlineHtml(c)}</th>`)
          .join("") +
        `</tr></thead><tbody>` +
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

const MAX_ALIGN_WIDTH = 40;

function escapeText(s: string, cell: boolean): string {
  let out = s
    .replace(/([\\`*_[\]])/g, "\\$1")
    .replace(/~~/g, "\\~~")
    .replace(/<(?=[A-Za-z/!?])/g, "\\<");
  if (cell) out = out.replace(/\|/g, "\\|");
  return out;
}

function escapeLeading(s: string): string {
  return s.replace(
    /^(\s*)(>|#{1,6}\s|[-*+]\s|\d+[.)]\s)/,
    (_, space: string, marker: string) => space + "\\" + marker,
  );
}

function inlineMd(nodes: readonly Inline[], cell: boolean): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") {
      const text = escapeText(n.value, cell);
      out += parseInline(text).some((m) => m.type === "math")
        ? text.replace(/\$/g, "\\$")
        : text;
    }
    else if (n.type === "code") {
      const ticks = "`".repeat((n.value.match(/`+/g)?.[0]?.length ?? 0) + 1);
      const pad = n.value.startsWith("`") || n.value.endsWith("`") ? " " : "";
      out += ticks + pad + n.value + pad + ticks;
    } else if (n.type === "math") out += mathSource(n.open, n.value);
    else if (n.type === "strong")
      out += `**${inlineMd(n.children, cell)}**`;
    else if (n.type === "em") out += `*${inlineMd(n.children, cell)}*`;
    else if (n.type === "del") out += `~~${inlineMd(n.children, cell)}~~`;
    else if (n.auto) out += `<${n.url}>`;
    else out += `[${inlineMd(n.children, cell)}](${n.url})`;
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

function blockMd(b: Block): string {
  switch (b.type) {
    case "heading":
      return "#".repeat(b.depth) + " " + inlineMd(b.children, false);
    case "paragraph":
      return escapeLeading(inlineMd(b.children, false));
    case "rule":
      return "---";
    case "codeblock": {
      const f = fenceFor(b.value);
      return f + b.lang + "\n" + b.value + "\n" + f;
    }
    case "latex":
      return b.value;
    case "math":
      if (b.fence === "env") return b.value;
      return b.fence + "\n" + b.value + "\n" + MATH_CLOSE[b.fence];
    case "quote":
      return b.children
        .map(blockMd)
        .join("\n\n")
        .split("\n")
        .map((l) => (l ? "> " + l : ">"))
        .join("\n");
    case "list":
      return b.items
        .map((it, i) => {
          const marker = b.ordered ? `${b.start + i}.` : "-";
          return marker + " " + inlineMd(it, false);
        })
        .join("\n");
    case "table": {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      const cells = b.rows.map((r) =>
        Array.from({ length: width }, (_, i) => inlineMd(r[i] ?? [], true)),
      );
      const natural = Array.from({ length: width }, (_, i) =>
        Math.max(3, ...cells.map((r) => r[i]!.length)),
      );
      const aligned = Math.max(...natural) <= MAX_ALIGN_WIDTH;
      const widths = aligned ? natural : natural.map(() => 3);
      const pad = (s: string, i: number): string =>
        aligned ? s.padEnd(widths[i]!) : s;
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
      const row = (r: string[]): string =>
        "| " + r.map(pad).join(" | ") + " |";
      const [head, ...body] = cells;
      return [
        row(head ?? []),
        "| " + divider.join(" | ") + " |",
        ...body.map(row),
      ].join("\n");
    }
  }
}

export function print(blocks: readonly Block[]): string {
  return blocks.map(blockMd).join("\n\n") + (blocks.length ? "\n" : "");
}

export function format(src: string): string {
  return print(parse(src));
}

function hasInlineMarkup(nodes: readonly Inline[]): boolean {
  return nodes.some((n) => n.type !== "text");
}

export function isMarkdown(blocks: readonly Block[]): boolean {
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
      case "codeblock":
      case "math":
      case "latex":
      case "table":
      case "quote":
      case "rule":
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
