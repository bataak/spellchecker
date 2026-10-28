import { cellFills, isBlankRow, type Block, type Inline } from "../markdown.ts";
import { flatten } from "../office/flatten.ts";
import { columnWidths, shareWidths } from "../office/table.ts";
import {
  tableStrokes,
  type Stroke,
  type TableLook,
} from "../markdown/tablelook.ts";

const COLUMN = { left: "l", center: "c", right: "r" } as const;

const RAGGED = {
  left: "\\raggedright",
  center: "\\centering",
  right: "\\raggedleft",
} as const;

const TEXT_WIDTH_CM = 13.7;
const RULE_CM = 0.015;
const SLACK_CM = 0.02;
const CELL_PAD_CM = 0.42;

type TableBlock = Extract<Block, { type: "table" }>;

function ruleLine(boxed: boolean) {
  return (stroke: Stroke, edge: "top" | "mid" | "bottom"): string[] => {
    if (stroke === 0) return [];
    if (boxed) return ["\\hline"];
    if (stroke === 1) return ["\\midrule"];
    return [edge === "top" ? "\\toprule" : "\\bottomrule"];
  };
}

export function tableLatex(
  b: TableBlock,
  inline: (nodes: readonly Inline[]) => string,
  { place, look }: { readonly place?: string; readonly look?: TableLook } = {},
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
  const ruleCm = grid ? (fitted.length + 1) * RULE_CM : 0;
  const target = share === null ? 0 : TEXT_WIDTH_CM * share - ruleCm - SLACK_CM;
  const widths = shareWidths(fitted, b.rule, target);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const trim = CELL_PAD_CM + (ruleCm + SLACK_CM) / widths.length;
  const size = (width: number): string =>
    share === null
      ? Math.max(0.5, width - CELL_PAD_CM).toFixed(2) + "cm"
      : "\\dimexpr " +
        ((share * width) / total).toFixed(4) +
        "\\linewidth-" +
        trim.toFixed(3) +
        "cm\\relax";
  const columns = widths.map((width, i) => {
    const a = b.align[i];
    if (!wrap) return a ? COLUMN[a] : "l";
    return (
      ">{" + RAGGED[a ?? "left"] + "\\arraybackslash}p{" + size(width) + "}"
    );
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
  const titled = place === undefined && header;
  const strokes = tableStrokes(look?.rules, titled);
  const line = ruleLine(grid);
  const lines = rows.flatMap((r, i) => [
    row(r, titled && i === 0),
    ...(i < rows.length - 1
      ? line(i === 0 ? strokes.head : strokes.rows, "mid")
      : []),
  ]);
  const tabular = [
    "\\begin{tabular}{" + spec + "}",
    ...line(strokes.top, "top"),
    ...lines,
    ...line(strokes.bottom, "bottom"),
  ];
  if (place !== undefined)
    return [
      "\\renewcommand{\\arraystretch}{1.5}",
      ...tabular,
      "\\end{tabular}",
    ].join("\n");
  return [
    "\\par\\addvspace{\\medskipamount}",
    "{\\centering\\small",
    ...tabular,
    "\\end{tabular}\\par}",
    "\\addvspace{\\medskipamount}",
  ].join("\n");
}
