import { cellFills, isBlankRow, type Block, type Inline } from "../markdown.ts";
import { flatten } from "../office/flatten.ts";
import { columnWidths, shareWidths } from "../office/table.ts";

const COLUMN = { left: "l", center: "c", right: "r" } as const;

const RAGGED = {
  left: "\\raggedright",
  center: "\\centering",
  right: "\\raggedleft",
} as const;

const TEXT_WIDTH_CM = 13.7;

type TableBlock = Extract<Block, { type: "table" }>;

export function tableLatex(
  b: TableBlock,
  inline: (nodes: readonly Inline[]) => string,
  place?: string,
  share?: number | null,
): string {
  const [head, ...body] = b.rows;
  const header = !isBlankRow(head);
  const rows = header ? b.rows : body;
  const cells = rows.map((r) => r.map((cell) => flatten(cell)));
  const natural = columnWidths(cells, false, Number.POSITIVE_INFINITY);
  const wrap =
    !!share || natural.reduce((sum, width) => sum + width, 0) > TEXT_WIDTH_CM;
  const fitted = wrap ? columnWidths(cells, header, TEXT_WIDTH_CM) : natural;
  const widths = shareWidths(fitted, b.rule, TEXT_WIDTH_CM * (share ?? 0));
  const spec = widths
    .map((width, i) => {
      const a = b.align[i];
      if (!wrap) return a ? COLUMN[a] : "l";
      const size = Math.max(0.5, width - 0.42).toFixed(2);
      return ">{" + RAGGED[a ?? "left"] + "\\arraybackslash}p{" + size + "cm}";
    })
    .join("");
  const row = (r: readonly Inline[][], bold: boolean): string =>
    widths
      .map((_, i) => {
        const cell = r[i] ?? [];
        if (cellFills(cell)) return "\\hrulefill";
        const text = inline(cell);
        return bold && text ? "\\textbf{" + text + "}" : text;
      })
      .join(" & ") + " \\\\";
  if (place !== undefined)
    return [
      "\\renewcommand{\\arraystretch}{1.5}",
      "\\begin{tabular}{" + spec + "}",
      ...rows.map((r) => row(r, false)),
      "\\end{tabular}",
    ].join("\n");
  return [
    "\\par\\addvspace{\\medskipamount}",
    "{\\centering\\small",
    "\\begin{tabular}{" + spec + "}",
    ...(header ? ["\\toprule", row(head ?? [], true), "\\midrule"] : []),
    ...body.map((r) => row(r, false)),
    ...(header ? ["\\bottomrule"] : []),
    "\\end{tabular}\\par}",
    "\\addvspace{\\medskipamount}",
  ].join("\n");
}
