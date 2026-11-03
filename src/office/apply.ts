import { tableLook } from "../markdown/tablelook.ts";
import {
  fitBlanks,
  isBlankRow,
  parseInline,
  type Block,
  type Inline,
} from "../markdown.ts";
import type { Frame, Template } from "../doc/templates.ts";
import { STYLE, headingStyle } from "./docir.ts";
import type { Align, DocIr, IrBlock, IrRun } from "./docir.ts";
import { flatten, isBlank, onlyImages } from "./flatten.ts";
import { BASE, LETTER, PAGE } from "./applystyles.ts";

const PAIRS: readonly [RegExp, string][] = [
  [/"([^"]*)"/g, "«$1»"],
  [/\u201C([^\u201D]*)\u201D/g, "«$1»"],
];

export function guillemets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PAIRS)
    out = out.replace(pattern, replacement);
  return out;
}

const META_STYLE: Readonly<Record<string, string>> = {
  title: STYLE.title,
  subtitle: STYLE.meta,
  author: STYLE.meta,
  institute: STYLE.meta,
  date: STYLE.meta,
};

const ALIGNABLE: ReadonlySet<string> = new Set([
  STYLE.body,
  STYLE.bodyFirst,
  STYLE.signature,
  STYLE.signatureTop,
]);

function divStyle(classes: readonly string[]): string | null {
  if (classes.includes("signature")) return STYLE.signature;
  if (classes.includes("right")) return STYLE.right;
  if (classes.includes("center")) return STYLE.center;
  if (classes.includes("left")) return STYLE.left;
  return null;
}

function runsOf(children: readonly Inline[]): IrRun[] {
  return flatten(children).map((run) =>
    run.mono ? run : { ...run, text: guillemets(run.text) },
  );
}

const RUN_IN_DEPTH = 4;

function alignOf(value: "left" | "right" | "center" | null): Align | null {
  if (value === "left") return "start";
  if (value === "right") return "end";
  if (value === "center") return "center";
  return null;
}

export function hasSections(blocks: readonly Block[]): boolean {
  return blocks.filter((block) => block.type === "heading").length > 1;
}

interface Ctx {
  readonly frame: Frame;
  readonly out: IrBlock[];
  seenHeading: boolean;
  afterHeading: boolean;
  runIn: IrRun[] | null;
  look: TableExtra;
}

type TableExtra = Partial<
  Pick<Extract<IrBlock, { kind: "table" }>, "share" | "rules" | "rowCm">
>;

type BlockOf<T extends Block["type"]> = Extract<Block, { type: T }>;

function visitHeading(
  ctx: Ctx,
  block: BlockOf<"heading">,
  next: Block | undefined,
): void {
  const runs = runsOf(block.children);
  if (isBlank(runs)) return;
  const first = ctx.frame === "letter" && !ctx.seenHeading;
  ctx.seenHeading = true;
  if (!first && block.depth === RUN_IN_DEPTH && next?.type === "paragraph") {
    ctx.runIn = runs.map((run) => ({ ...run, bold: true }));
    return;
  }
  ctx.out.push({
    kind: "para",
    style: first ? STYLE.title : headingStyle(block.depth),
    runs,
  });
  ctx.afterHeading = true;
}

function paragraphStyle(ctx: Ctx, runs: readonly IrRun[]): string {
  if (onlyImages(runs)) return STYLE.figure;
  return ctx.afterHeading ? STYLE.bodyFirst : STYLE.body;
}

function visitParagraph(ctx: Ctx, block: BlockOf<"paragraph">): void {
  const runs = runsOf(block.children);
  if (isBlank(runs)) return;
  if (ctx.runIn !== null) {
    ctx.out.push({
      kind: "para",
      style: STYLE.runIn,
      runs: [...ctx.runIn, { text: " " }, ...runs],
    });
    ctx.runIn = null;
  } else {
    ctx.out.push({ kind: "para", style: paragraphStyle(ctx, runs), runs });
  }
  ctx.afterHeading = false;
}

function listBlock(block: BlockOf<"list">): IrBlock {
  return {
    kind: "list",
    ordered: block.ordered,
    start: block.start,
    style: STYLE.listItem,
    items: block.items.map(runsOf),
    ...(block.levels ? { levels: block.levels } : {}),
  };
}

function codeBlock(value: string): IrBlock {
  return {
    kind: "para",
    style: STYLE.code,
    verbatim: true,
    runs: value.split("\n").map((line) => ({ text: line, mono: true })),
  };
}

function tableBlock(block: BlockOf<"table">): IrBlock {
  const align = block.align.map(alignOf);
  const rule = block.rule ? { rule: block.rule } : {};
  if (!isBlankRow(block.rows[0]))
    return {
      kind: "table",
      align,
      rows: block.rows.map((r) => r.map(runsOf)),
      ...rule,
    };
  return {
    kind: "table",
    align,
    rows: block.rows.slice(1).map((row) => row.map(runsOf)),
    header: false,
    ...rule,
  };
}

function visitMeta(ctx: Ctx, block: BlockOf<"meta">): void {
  for (const field of block.fields) {
    const style = META_STYLE[field.key];
    if (!style) continue;
    ctx.out.push({
      kind: "para",
      style,
      runs: runsOf(parseInline(field.value)),
    });
  }
}

function visitQuote(ctx: Ctx, block: BlockOf<"quote">): void {
  const from = ctx.out.length;
  visit(ctx, block.children);
  for (let i = from; i < ctx.out.length; i += 1) {
    const inner = ctx.out[i]!;
    if (inner.kind === "para") ctx.out[i] = { ...inner, style: STYLE.quote };
  }
  ctx.afterHeading = false;
}

function placementOf(classes: readonly string[]): Align {
  if (classes.includes("left")) return "start";
  if (classes.includes("center")) return "center";
  return "end";
}

function alignDivBlock(
  inner: IrBlock,
  classes: readonly string[],
  style: string,
  first: boolean,
): IrBlock {
  if (inner.kind === "table")
    return {
      ...inner,
      placement: placementOf(classes),
      cellStyle: STYLE.signCell,
    };
  if (inner.kind !== "para" || !ALIGNABLE.has(inner.style)) return inner;
  const signature = first && classes.includes("signature");
  return { ...inner, style: signature ? STYLE.signatureTop : style };
}

function visitDiv(ctx: Ctx, block: BlockOf<"div">): void {
  const { classes } = block;
  if (classes.includes("notes")) return;
  const { out } = ctx;
  const from = out.length;
  const look = tableLook(classes, block.keys);
  const outer = ctx.look;
  ctx.look = {
    ...(look.share !== null && { share: look.share }),
    ...(look.rules !== null && { rules: look.rules }),
    ...(look.rowCm !== null && { rowCm: look.rowCm }),
  };
  visit(ctx, block.children);
  ctx.look = outer;
  const style = divStyle(classes);
  if (style === null) return;
  for (let i = from; i < out.length; i += 1)
    out[i] = alignDivBlock(out[i]!, classes, style, i === from);
  if (classes.includes("signature") && out[from]?.kind === "table")
    out.splice(from, 0, { kind: "para", style: STYLE.signatureGap, runs: [] });
  ctx.afterHeading = false;
}

function emit(ctx: Ctx, ...blocks: IrBlock[]): void {
  ctx.out.push(...blocks);
  ctx.afterHeading = false;
}

function visitBlock(ctx: Ctx, block: Block, next: Block | undefined): void {
  switch (block.type) {
    case "heading":
      return visitHeading(ctx, block, next);
    case "paragraph":
      return visitParagraph(ctx, block);
    case "list":
      return emit(ctx, listBlock(block));
    case "quote":
      return visitQuote(ctx, block);
    case "math":
    case "latex":
    case "codeblock":
      return emit(ctx, codeBlock(block.value));
    case "table":
      return emit(
        ctx,
        { ...tableBlock(block), ...ctx.look },
        {
          kind: "para",
          style: STYLE.tableGap,
          runs: [],
        },
      );
    case "rule":
      return emit(ctx, { kind: "rule" });
    case "pagebreak":
      return emit(ctx, { kind: "break" });
    case "meta":
      return visitMeta(ctx, block);
    case "div":
      return visitDiv(ctx, block);
  }
}

function visit(ctx: Ctx, list: readonly Block[]): void {
  list.forEach((block, index) => visitBlock(ctx, block, list[index + 1]));
}

export function applyTemplate(
  blocks: readonly Block[],
  template: Template,
): DocIr {
  const frame: Frame = template.frame;
  const out: IrBlock[] = [];
  visit(
    {
      frame,
      out,
      seenHeading: false,
      afterHeading: false,
      runIn: null,
      look: {},
    },
    fitBlanks(blocks),
  );

  const title = out.find((b) => b.kind === "para" && b.style === STYLE.title);

  return {
    blocks: out,
    styles: frame === "letter" ? { ...BASE, ...LETTER } : BASE,
    font: { family: "Times New Roman", sizePt: 12 },
    page: PAGE,
    pageNumbers: frame !== "letter" || hasSections(blocks),
    title:
      title && title.kind === "para"
        ? title.runs
            .map((r) => r.text)
            .join("")
            .replace(/\s*\n\s*/g, " ")
        : undefined,
  };
}
