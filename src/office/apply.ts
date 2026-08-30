import type { Block, Inline } from "../markdown.ts";
import type { Frame, Template } from "../templates.ts";
import { A4, STYLE, headingStyle } from "./docir.ts";
import type { Align, DocIr, IrBlock, IrRun, ParaStyle } from "./docir.ts";
import { flatten, isBlank } from "./flatten.ts";

const MONTH_WORD = [
  "дүгээр",
  "дугаар",
  "дугаар",
  "дүгээр",
  "дугаар",
  "дугаар",
  "дугаар",
  "дугаар",
  "дүгээр",
  "дугаар",
  "дүгээр",
  "дугаар",
];

const DAY_SUFFIX = ["ны", "ний", "ны", "ны", "ний", "ны", "ны", "ны", "ны", "ний"];

const pad = (n: number): string => String(n).padStart(2, "0");

export function mongolianDate(date: Date): string {
  const month = date.getMonth();
  const day = date.getDate();
  return (
    String(date.getFullYear()) +
    " оны " +
    pad(month + 1) +
    " " +
    MONTH_WORD[month] +
    " сарын " +
    pad(day) +
    "-" +
    DAY_SUFFIX[day % 10] +
    " өдөр"
  );
}

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

function runsOf(children: readonly Inline[]): IrRun[] {
  return flatten(children).map((run) => ({
    ...run,
    text: guillemets(run.text),
  }));
}

const BASE: Readonly<Record<string, ParaStyle>> = {
  [STYLE.body]: {
    align: "justify",
    lineHeightPercent: 150,
    firstLineIndentCm: 1.25,
  },
  [STYLE.bodyFirst]: { align: "justify", lineHeightPercent: 150 },
  [STYLE.title]: {
    align: "center",
    bold: true,
    sizePt: 14,
    lineHeightPercent: 130,
    spaceAfterPt: 18,
    keepWithNext: true,
  },
  [STYLE.recipient]: { align: "center", lineHeightPercent: 130 },
  [STYLE.date]: { align: "start", spaceBeforePt: 30 },
  [STYLE.signature]: { align: "end", lineHeightPercent: 150 },
  [STYLE.signatureTop]: { align: "end", lineHeightPercent: 150 },
  [STYLE.signLine]: {
    align: "start",
    lineHeightPercent: 150,
    spaceBeforePt: 42,
    leaderTabCm: 16.5,
    rightTab: true,
  },
  [STYLE.signRule]: {
    marginLeftCm: 10,
    spaceBeforePt: 54,
    spaceAfterPt: 2,
    leaderTabCm: 6.5,
  },
  [STYLE.quote]: {
    marginLeftCm: 1.25,
    marginRightCm: 1.25,
    italic: true,
    lineHeightPercent: 130,
  },
  [STYLE.code]: { mono: true, sizePt: 10, lineHeightPercent: 110 },
  [STYLE.listItem]: { lineHeightPercent: 150 },
  [STYLE.tableHead]: { bold: true, align: "center" },
  [STYLE.tableCell]: {},
  Heading1: {
    sizePt: 14,
    bold: true,
    spaceBeforePt: 18,
    spaceAfterPt: 8,
    keepWithNext: true,
    outlineLevel: 1,
  },
  Heading2: {
    sizePt: 13,
    bold: true,
    spaceBeforePt: 14,
    spaceAfterPt: 6,
    keepWithNext: true,
    outlineLevel: 2,
  },
  Heading3: {
    sizePt: 12,
    bold: true,
    spaceBeforePt: 12,
    spaceAfterPt: 4,
    keepWithNext: true,
    outlineLevel: 3,
  },
  Heading4: { sizePt: 12, italic: true, spaceBeforePt: 10, outlineLevel: 4 },
  Heading5: { sizePt: 12, italic: true, spaceBeforePt: 8, outlineLevel: 5 },
  Heading6: { sizePt: 12, italic: true, spaceBeforePt: 6, outlineLevel: 6 },
};

const SIGN_MAX = 60;

const SENTENCE_END = /[.!?\u2026]\s*$/;

const DATE_LIKE = /\d{4}\s*оны\s+\d{1,2}/;

function signatureLine(runs: readonly IrRun[]): IrRun[] | null {
  const text = runs.map((r) => r.text).join("").trim();
  const at = text.indexOf(":");
  if (at < 0) return null;

  const label = text.slice(0, at + 1).trim();
  const name = text.slice(at + 1).trim();
  if (!label || !name) return null;

  const wrapped = name.startsWith("/") ? name : "/" + name + "/";
  return [{ text: label }, { text: "", tab: true }, { text: wrapped }];
}

function isSignatureLine(text: string): boolean {
  return text.length <= SIGN_MAX && !SENTENCE_END.test(text);
}

const PAGE = {
  widthCm: A4.widthCm,
  heightCm: A4.heightCm,
  marginTopCm: 2,
  marginBottomCm: 2,
  marginInnerCm: 3,
  marginOuterCm: 1.5,
  mirrored: true,
};

function alignOf(value: "left" | "right" | "center" | null): Align | null {
  if (value === "left") return "start";
  if (value === "right") return "end";
  if (value === "center") return "center";
  return null;
}

export interface ApplyOptions {
  readonly now?: Date;
  readonly numberHeadings?: boolean;
}

export function applyTemplate(
  blocks: readonly Block[],
  template: Template,
  options: ApplyOptions = {},
): DocIr {
  const frame: Frame = template.frame;
  const out: IrBlock[] = [];

  let seenHeading = false;
  let afterHeading = false;

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const runs = runsOf(block.children);
        if (isBlank(runs)) break;
        const first = frame === "letter" && !seenHeading;
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
        let style: string = afterHeading ? STYLE.bodyFirst : STYLE.body;
        if (frame === "letter" && !seenHeading) style = STYLE.recipient;
        out.push({ kind: "para", style, runs });
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

      case "quote":
        for (const inner of applyTemplate(block.children, template, options)
          .blocks)
          out.push(
            inner.kind === "para" ? { ...inner, style: STYLE.quote } : inner,
          );
        afterHeading = false;
        break;

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
        out.push({
          kind: "table",
          align: block.align.map(alignOf),
          rows: block.rows.map((row) => row.map(runsOf)),
        });
        afterHeading = false;
        break;

      case "rule":
        out.push({ kind: "rule" });
        afterHeading = false;
        break;
    }
  }

  if (frame === "letter") {
    let cut = out.length;
    let hasDate = false;
    while (cut > 0) {
      const block = out[cut - 1]!;
      if (block.kind !== "para") break;
      if (block.style !== STYLE.body && block.style !== STYLE.bodyFirst) break;
      const text = block.runs.map((r) => r.text).join("").trim();
      if (!isSignatureLine(text)) break;
      if (DATE_LIKE.test(text)) hasDate = true;
      cut -= 1;
    }

    let inlineLine = false;

    for (let i = cut; i < out.length; i += 1) {
      const block = out[i]!;
      if (block.kind !== "para") continue;

      if (i === cut) {
        const line = signatureLine(block.runs);
        if (line !== null) {
          out[i] = { kind: "para", style: STYLE.signLine, runs: line };
          inlineLine = true;
          continue;
        }
      }

      out[i] = {
        ...block,
        style: i === cut ? STYLE.signatureTop : STYLE.signature,
      };
    }

    const tail: IrBlock[] = [];
    if (!hasDate)
      tail.push({
        kind: "para",
        style: STYLE.date,
        runs: [{ text: mongolianDate(options.now ?? new Date()) }],
      });
    if (cut < out.length && !inlineLine)
      tail.push({ kind: "para", style: STYLE.signRule, runs: [] });
    out.splice(cut, 0, ...tail);
  }

  const title = out.find((b) => b.kind === "para" && b.style === STYLE.title);

  return {
    blocks: out,
    styles: BASE,
    font: { family: "Times New Roman", sizePt: 12 },
    page: PAGE,
    header:
      frame === "structured"
        ? { pageNumberRight: true, rule: false }
        : undefined,
    title:
      title && title.kind === "para"
        ? title.runs.map((r) => r.text).join("")
        : undefined,
  };
}
