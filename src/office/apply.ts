import {
  fitBlanks,
  isBlankRow,
  parseInline,
  type Block,
  type Inline,
} from "../markdown.ts";
import type { Frame, Template } from "../templates.ts";
import { A4, STYLE, headingStyle } from "./docir.ts";
import type { Align, DocIr, IrBlock, IrRun, ParaStyle } from "./docir.ts";
import { flatten, isBlank } from "./flatten.ts";

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
  subtitle: STYLE.center,
  author: STYLE.center,
  institute: STYLE.center,
  date: STYLE.center,
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
  return flatten(children).map((run) => ({
    ...run,
    text: guillemets(run.text),
  }));
}

const RUN_IN_DEPTH = 4;

const PARA_GAP_PT = 6;

const SIGNATURE_GAP_PT = 22;

const BASE: Readonly<Record<string, ParaStyle>> = {
  [STYLE.body]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.bodyFirst]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.runIn]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceBeforePt: 14,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.title]: {
    align: "center",
    bold: true,
    sizePt: 17,
    lineHeightPercent: 115,
    spaceAfterPt: 18,
    keepWithNext: true,
  },
  [STYLE.signature]: { align: "end", lineHeightPercent: 150 },
  [STYLE.signatureTop]: {
    align: "end",
    lineHeightPercent: 150,
    spaceBeforePt: SIGNATURE_GAP_PT,
  },
  [STYLE.right]: { align: "end", lineHeightPercent: 115 },
  [STYLE.signatureGap]: {
    sizePt: 1,
    lineHeightPercent: 100,
    spaceBeforePt: SIGNATURE_GAP_PT - 1,
  },
  [STYLE.signCell]: { lineHeightPercent: 150, noHyphenation: true },
  [STYLE.center]: { align: "center", lineHeightPercent: 115 },
  [STYLE.left]: { align: "start", lineHeightPercent: 115 },
  [STYLE.quote]: {
    align: "justify",
    marginLeftCm: 1.25,
    marginRightCm: 1.25,
    lineHeightPercent: 115,
    spaceBeforePt: 6,
    spaceAfterPt: 6,
  },
  [STYLE.code]: { mono: true, lineHeightPercent: 100 },
  [STYLE.listItem]: { align: "justify", lineHeightPercent: 115 },
  [STYLE.tableHead]: {
    bold: true,
    sizePt: 11,
    lineHeightPercent: 100,
    noHyphenation: true,
  },
  [STYLE.tableCell]: {
    sizePt: 11,
    lineHeightPercent: 100,
    noHyphenation: true,
  },
  [STYLE.tableGap]: { sizePt: 6, lineHeightPercent: 100 },
  Heading1: {
    align: "center",
    sizePt: 14,
    bold: true,
    spaceBeforePt: 28,
    spaceAfterPt: 14,
    keepWithNext: true,
    outlineLevel: 1,
  },
  Heading2: {
    sizePt: 13,
    bold: true,
    spaceBeforePt: 21,
    spaceAfterPt: 10,
    keepWithNext: true,
    outlineLevel: 2,
  },
  Heading3: {
    sizePt: 12,
    bold: true,
    spaceBeforePt: 14,
    spaceAfterPt: 7,
    keepWithNext: true,
    outlineLevel: 3,
  },
  Heading4: { sizePt: 12, bold: true, spaceBeforePt: 14, outlineLevel: 4 },
  Heading5: { sizePt: 12, italic: true, spaceBeforePt: 8, outlineLevel: 5 },
  Heading6: { sizePt: 12, italic: true, spaceBeforePt: 6, outlineLevel: 6 },
};

const LETTER: Readonly<Record<string, ParaStyle>> = {
  [STYLE.title]: {
    align: "center",
    bold: true,
    sizePt: 14,
    lineHeightPercent: 130,
    spaceBeforePt: 18,
    spaceAfterPt: 20,
    keepWithNext: true,
  },
  [STYLE.signatureTop]: {
    align: "end",
    lineHeightPercent: 150,
    spaceBeforePt: SIGNATURE_GAP_PT,
    spaceAfterPt: 7,
  },
  [STYLE.signature]: {
    align: "end",
    lineHeightPercent: 150,
    spaceAfterPt: 7,
  },
};

const PAGE = {
  widthCm: A4.widthCm,
  heightCm: A4.heightCm,
  marginTopCm: 2,
  marginBottomCm: 2,
  marginInnerCm: 3,
  marginOuterCm: 1.5,
  mirrored: false,
};

function alignOf(value: "left" | "right" | "center" | null): Align | null {
  if (value === "left") return "start";
  if (value === "right") return "end";
  if (value === "center") return "center";
  return null;
}

export function hasSections(blocks: readonly Block[]): boolean {
  return blocks.filter((block) => block.type === "heading").length > 1;
}

export function applyTemplate(
  blocks: readonly Block[],
  template: Template,
): DocIr {
  const frame: Frame = template.frame;
  const out: IrBlock[] = [];

  let seenHeading = false;
  let afterHeading = false;

  let runIn: IrRun[] | null = null;

  const visit = (list: readonly Block[]): void => {
  let index = -1;
  for (const block of list) {
    index += 1;
    switch (block.type) {
      case "heading": {
        const runs = runsOf(block.children);
        if (isBlank(runs)) break;
        const first = frame === "letter" && !seenHeading;
        if (
          !first &&
          block.depth === RUN_IN_DEPTH &&
          list[index + 1]?.type === "paragraph"
        ) {
          runIn = runs.map((run) => ({ ...run, bold: true }));
          seenHeading = true;
          break;
        }
        out.push({
          kind: "para",
          style: first ? STYLE.title : headingStyle(block.depth),
          runs,
        });
        seenHeading = true;
        afterHeading = true;
        break;
      }

      case "paragraph": {
        const runs = runsOf(block.children);
        if (isBlank(runs)) break;
        if (runIn !== null) {
          out.push({
            kind: "para",
            style: STYLE.runIn,
            runs: [...runIn, { text: " " }, ...runs],
          });
          runIn = null;
          afterHeading = false;
          break;
        }
        out.push({
          kind: "para",
          style: afterHeading ? STYLE.bodyFirst : STYLE.body,
          runs,
        });
        afterHeading = false;
        break;
      }

      case "list":
        out.push({
          kind: "list",
          ordered: block.ordered,
          start: block.start,
          style: STYLE.listItem,
          items: block.items.map(runsOf),
        });
        afterHeading = false;
        break;

      case "quote": {
        const from = out.length;
        visit(block.children);
        for (let i = from; i < out.length; i += 1) {
          const inner = out[i]!;
          if (inner.kind === "para") out[i] = { ...inner, style: STYLE.quote };
        }
        afterHeading = false;
        break;
      }

      case "math":
      case "latex":
      case "codeblock":
        out.push({
          kind: "para",
          style: STYLE.code,
          runs: block.value
            .split("\n")
            .map((line) => ({ text: line, mono: true })),
        });
        afterHeading = false;
        break;

      case "table":
        out.push(
          isBlankRow(block.rows[0])
            ? {
                kind: "table",
                align: block.align.map(alignOf),
                rows: block.rows.slice(1).map((row) => row.map(runsOf)),
                header: false,
              }
            : {
                kind: "table",
                align: block.align.map(alignOf),
                rows: block.rows.map((row) => row.map(runsOf)),
              },
        );
        out.push({ kind: "para", style: STYLE.tableGap, runs: [] });
        afterHeading = false;
        break;

      case "rule":
        out.push({ kind: "rule" });
        afterHeading = false;
        break;

      case "meta":
        for (const field of block.fields) {
          if (!META_STYLE[field.key]) continue;
          out.push({
            kind: "para",
            style: META_STYLE[field.key]!,
            runs: runsOf(parseInline(field.value)),
          });
        }
        break;

      case "div": {
        if (block.classes.includes("notes")) break;
        const from = out.length;
        visit(block.children);
        const style = divStyle(block.classes);
        if (style === null) break;
        for (let i = from; i < out.length; i += 1) {
          const inner = out[i]!;
          if (inner.kind === "table")
            out[i] = {
              ...inner,
              placement: block.classes.includes("left")
                ? "start"
                : block.classes.includes("center")
                  ? "center"
                  : "end",
              cellStyle: STYLE.signCell,
            };
          else if (inner.kind === "para" && ALIGNABLE.has(inner.style))
            out[i] = {
              ...inner,
              style: i === from && block.classes.includes("signature")
                ? STYLE.signatureTop
                : style,
            };
        }
        if (
          block.classes.includes("signature") &&
          out[from]?.kind === "table"
        )
          out.splice(from, 0, {
            kind: "para",
            style: STYLE.signatureGap,
            runs: [],
          });
        afterHeading = false;
        break;
      }
    }
  }
  };
  visit(fitBlanks(blocks));

  const title = out.find((b) => b.kind === "para" && b.style === STYLE.title);

  return {
    blocks: out,
    styles: frame === "letter" ? { ...BASE, ...LETTER } : BASE,
    font: { family: "Times New Roman", sizePt: 12 },
    page: PAGE,
    pageNumbers: frame !== "letter" || hasSections(blocks),
    title:
      title && title.kind === "para"
        ? title.runs.map((r) => r.text).join("")
        : undefined,
  };
}
