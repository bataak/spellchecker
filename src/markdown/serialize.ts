import { tableShare } from "../office/table.ts";
import { type Block, type Inline, type ListTree, listTree } from "./ast.ts";
import { RULE_RE, parse } from "./blocks.ts";
import { MATH_CLOSE } from "./mathblock.ts";
import { imageAttrs, parseInline } from "./inline.ts";
import { mathSource } from "./texlogo.ts";

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
    key === "line" || key === "rule" ? undefined : item,
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

function listMd(tree: ListTree, indent: string, full: boolean): string {
  return tree.entries
    .map(({ item, sub }, i) => {
      const marker = tree.ordered ? `${tree.start + i}.` : "-";
      const line = indent + marker + " " + inlineOut(item, false, full);
      if (!sub) return line;
      const inner = indent + " ".repeat(marker.length + 1);
      return line + "\n" + listMd(sub, inner, full);
    })
    .join("\n");
}

function ruleScale(
  rule: readonly number[] | undefined,
  cells: readonly string[][],
  colons: (i: number) => number,
): number {
  if (!rule) return 1;
  let scale = 1;
  rule.forEach((bar, i) => {
    if (bar <= 0) return;
    const needed = Math.max(3, ...cells.map((r) => r[i]?.length ?? 0));
    scale = Math.max(scale, (needed - colons(i)) / bar);
  });
  return scale;
}

function tableMd(
  b: Extract<Block, { type: "table" }>,
  full: boolean,
  ratio: boolean,
): string {
  const width = Math.max(...b.rows.map((r) => r.length), 1);
  const cells = b.rows.map((r) =>
    Array.from({ length: width }, (_, i) => inlineOut(r[i] ?? [], true, full)),
  );
  const colons = (i: number): number =>
    b.align[i] === "center" ? 2 : b.align[i] ? 1 : 0;
  const scale = ratio ? ruleScale(b.rule, cells, colons) : 1;
  const bars = Array.from({ length: width }, (_, i) =>
    Math.ceil((b.rule?.[i] ?? 0) * scale),
  );
  const natural = Array.from({ length: width }, (_, i) =>
    Math.max(3, bars[i]! + colons(i), ...cells.map((r) => r[i]!.length)),
  );
  const aligned = natural.reduce((sum, w) => sum + w + 3, 1) <= MAX_ALIGN_ROW;
  const widths = aligned
    ? natural
    : natural.map((_, i) => Math.max(3, bars[i]! + colons(i)));
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

function blockMd(b: Block, full: boolean, ratio = false): string {
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
        b.children
          .map((inner) =>
            blockMd(
              inner,
              full,
              !b.classes.includes("column") &&
                tableShare(b.keys["width"]) !== null,
            ),
          )
          .join("\n\n") +
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
      return listMd(listTree(b), "", full);
    case "table":
      return tableMd(b, full, ratio);
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
