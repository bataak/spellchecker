import { type Block, type Inline } from "./ast.ts";

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
