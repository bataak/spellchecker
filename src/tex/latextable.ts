import { cellFills, isBlankRow, type Block, type Inline } from "../markdown.ts";
import { flatten } from "../office/flatten.ts";
import { columnWidths, shareWidths, type TableLook } from "../office/table.ts";

const COLUMN = { left: "l", center: "c", right: "r" } as const;

const RAGGED = {
  left: "\\raggedright",
  center: "\\centering",
  right: "\\raggedleft",
} as const;

const TEXT_WIDTH_CM = 13.7;
const RULE_CM = 0.015;
const SLACK_CM = 0.02;

type TableBlock = Extract<Block, { type: "table" }>;

interface RuleLines {
  readonly top: string;
  readonly mid: string;
  readonly bottom: string;
  readonly between: string | null;
  readonly edge: string[];
  readonly tail: string[];
}

function ruleLines(look: TableLook | undefined): RuleLines {
  if (look?.rules === "grid")
    return {
      top: "\\hline",
      mid: "\\hline",
      bottom: "\\hline",
      between: "\\hline",
      edge: ["\\hline"],
      tail: ["\\hline"],
    };
  return {
    top: "\\toprule",
    mid: "\\midrule",
    bottom: "\\bottomrule",
    between: look?.rules ? "\\midrule" : null,
    edge: [],
    tail: look?.rules ? ["\\midrule"] : [],
  };
}

export function tableLatex(
  b: TableBlock,
  inline: (nodes: readonly Inline[]) => string,
  place?: string,
  look?: TableLook,
): string {
  const [head, ...body] = b.rows;
  const header = !isBlankRow(head);
  const rows = header ? b.rows : body;
  const cells = rows.map((r) => r.map((cell) => flatten(cell)));
  const natural = columnWidths(cells, false, Number.POSITIVE_INFINITY);
  const share = look?.share ?? null;
  const wrap =
    share !== null ||
    natural.reduce((sum, width) => sum + width, 0) > TEXT_WIDTH_CM;
  const fitted = wrap ? columnWidths(cells, header, TEXT_WIDTH_CM) : natural;
  const grid = look?.rules === "grid";
  const strokes = grid ? (fitted.length + 1) * RULE_CM : 0;
  const target =
    share === null ? 0 : TEXT_WIDTH_CM * share - strokes - SLACK_CM;
  const widths = shareWidths(fitted, b.rule, target);
  const columns = widths.map((width, i) => {
    const a = b.align[i];
    if (!wrap) return a ? COLUMN[a] : "l";
    const size = Math.max(0.5, width - 0.42).toFixed(2);
    return ">{" + RAGGED[a ?? "left"] + "\\arraybackslash}p{" + size + "cm}";
  });
  const spec = grid ? "|" + columns.join("|") + "|" : columns.join("");
  const strut = look?.rowCm ? "\\rule{0pt}{" + look.rowCm + "cm}" : "";
  const row = (r: readonly Inline[][], bold: boolean): string =>
    widths
      .map((_, i) => {
        const cell = r[i] ?? [];
        const lead = i === 0 && !bold ? strut : "";
        if (cellFills(cell)) return lead + "\\hrulefill";
        const text = inline(cell);
        return lead + (bold && text ? "\\textbf{" + text + "}" : text);
      })
      .join(" & ") + " \\\\";
  const rules = ruleLines(look);
  const lines = (list: readonly Inline[][][]): string[] =>
    list.flatMap((r, i) =>
      rules.between && i < list.length - 1
        ? [row(r, false), rules.between]
        : [row(r, false)],
    );
  if (place !== undefined)
    return [
      "\\renewcommand{\\arraystretch}{1.5}",
      "\\begin{tabular}{" + spec + "}",
      ...rules.edge,
      ...lines(rows),
      ...rules.tail,
      "\\end{tabular}",
    ].join("\n");
  return [
    "\\par\\addvspace{\\medskipamount}",
    "{\\centering\\small",
    "\\begin{tabular}{" + spec + "}",
    ...(header ? [rules.top, row(head ?? [], true), rules.mid] : rules.edge),
    ...lines(body),
    ...(header ? [rules.bottom] : rules.tail),
    "\\end{tabular}\\par}",
    "\\addvspace{\\medskipamount}",
  ].join("\n");
}
