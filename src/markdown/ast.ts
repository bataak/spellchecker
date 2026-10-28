import { type MathOpen } from "./texlogo.ts";

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
export interface ListLevel {
  depth: number;
  ordered: boolean;
  start: number;
}
export interface ListNode {
  type: "list";
  ordered: boolean;
  start: number;
  items: Inline[][];
  levels?: ListLevel[];
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
  rule?: number[];
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

export function isFigure(nodes: readonly Inline[]): boolean {
  return (
    nodes.some((n) => n.type === "image") &&
    nodes.every(
      (n) =>
        n.type === "image" ||
        n.type === "softbreak" ||
        (n.type === "text" && !n.value.trim()),
    )
  );
}

export function blockImages(
  blocks: readonly Block[],
): (Inline & { type: "image" })[] {
  const out: (Inline & { type: "image" })[] = [];
  const walk = (nodes: readonly Inline[]): void => {
    for (const node of nodes)
      if (node.type === "image") out.push(node);
      else if ("children" in node) walk(node.children);
  };
  for (const b of blocks) {
    if (b.type === "paragraph" || b.type === "heading") walk(b.children);
    else if (b.type === "list") b.items.forEach(walk);
    else if (b.type === "table") for (const row of b.rows) row.forEach(walk);
    else if (b.type === "quote" || b.type === "div")
      out.push(...blockImages(b.children));
  }
  return out;
}

export interface ListTree<T = Inline[]> {
  ordered: boolean;
  start: number;
  entries: { item: T; sub: ListTree<T> | null }[];
}

export function listTree<T>(list: {
  readonly ordered: boolean;
  readonly start: number;
  readonly items: readonly T[];
  readonly levels?: readonly ListLevel[];
}): ListTree<T> {
  const root: ListTree<T> = {
    ordered: list.ordered,
    start: list.start,
    entries: [],
  };
  const stack = [root];
  list.items.forEach((item, i) => {
    const level = list.levels?.[i];
    const depth = Math.min(level?.depth ?? 0, stack.length);
    while (stack.length > depth + 1) stack.pop();
    let tree = stack.at(-1)!;
    const parent = tree.entries.at(-1);
    if (stack.length === depth && level && parent) {
      parent.sub = { ordered: level.ordered, start: level.start, entries: [] };
      tree = parent.sub;
      stack.push(tree);
    }
    tree.entries.push({ item, sub: null });
  });
  return root;
}
