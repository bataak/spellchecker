import type { DeckLine, DeckPart, DeckTable } from "./deck.ts";
import type { IrRun } from "./docir.ts";
import { ARIAL_BOLD, ARIAL_REGULAR } from "./arial.ts";
import { columnWidths, glyphWidth, type TextMetrics } from "./table.ts";

export const TEXT_PT = 20;
export const TABLE_PT = 16;

const PT_CM = 2.54 / 72;
const arialWidth = glyphWidth(ARIAL_REGULAR, ARIAL_BOLD);
const LINE = 1.2;
const PARA_GAP_CM = 0.2;
const BOX_PAD_CM = 0.3;
const LIST_INDENT_CM = 1.27;
const CELL_PAD_X_CM = 0.25;
const CELL_PAD_Y_CM = 0.12;
const PART_GAP_CM = 0.5;

function tableMetrics(pt: number): TextMetrics {
  return {
    width: (text, bold) => arialWidth(text, bold, pt),
    padCm: 2 * CELL_PAD_X_CM + 0.1,
    capCm: 12,
    wrapHeader: false,
  };
}

function textOf(runs: readonly IrRun[]): string {
  return runs.map((run) => run.text).join("");
}

function wrapped(
  text: string,
  widthCm: number,
  pt: number,
  bold = false,
): number {
  return text
    .split("\n")
    .reduce(
      (sum, line) =>
        sum +
        Math.max(
          1,
          Math.ceil(arialWidth(line, bold, pt) / Math.max(widthCm, 1)),
        ),
      0,
    );
}

function textHeight(
  lines: readonly DeckLine[],
  widthCm: number,
  pt: number,
): number {
  const lineCm = pt * PT_CM * LINE;
  return (
    BOX_PAD_CM +
    lines.reduce((sum, line) => {
      const room = widthCm - (line.kind === "para" ? 0 : LIST_INDENT_CM);
      return sum + wrapped(textOf(line.runs), room, pt) * lineCm + PARA_GAP_CM;
    }, 0)
  );
}

export interface TableLayout {
  readonly widths: readonly number[];
  readonly heights: readonly number[];
}

function tableLayout(
  table: DeckTable,
  widthCm: number,
  pt: number,
): TableLayout {
  const widths = columnWidths(
    table.rows,
    table.header,
    widthCm,
    tableMetrics(pt),
  );
  const lineCm = pt * PT_CM * LINE;
  const heights = table.rows.map(
    (row, r) =>
      Math.max(
        1,
        ...row.map((cell, i) =>
          wrapped(
            textOf(cell),
            (widths[i] ?? widthCm) - 2 * CELL_PAD_X_CM,
            pt,
            (table.header && r === 0) || cell.some((run) => run.bold),
          ),
        ),
      ) *
        lineCm +
      2 * CELL_PAD_Y_CM,
  );
  return { widths, heights };
}

export type PlacedPart =
  | {
      readonly kind: "text";
      readonly lines: readonly DeckLine[];
      readonly y: number;
      readonly h: number;
    }
  | {
      readonly kind: "table";
      readonly table: DeckTable;
      readonly x: number;
      readonly y: number;
      readonly layout: TableLayout;
    };

export interface SlideLayout {
  readonly scale: number;
  readonly parts: readonly PlacedPart[];
}

function measure(
  parts: readonly DeckPart[],
  widthCm: number,
  scale: number,
): { heights: number[]; tables: (TableLayout | null)[] } {
  const heights: number[] = [];
  const tables: (TableLayout | null)[] = [];
  for (const part of parts) {
    if (part.kind === "text") {
      heights.push(textHeight(part.lines, widthCm, TEXT_PT * scale));
      tables.push(null);
    } else {
      const layout = tableLayout(part.table, widthCm, TABLE_PT * scale);
      heights.push(layout.heights.reduce((sum, h) => sum + h, 0));
      tables.push(layout);
    }
  }
  return { heights, tables };
}

export function layoutSlide(
  parts: readonly DeckPart[],
  left: number,
  top: number,
  widthCm: number,
  heightCm: number,
): SlideLayout {
  const gaps = PART_GAP_CM * Math.max(0, parts.length - 1);
  let scale = 1;
  let measured = measure(parts, widthCm, scale);
  for (let step = 0; step < 8; step += 1) {
    const total = measured.heights.reduce((sum, h) => sum + h, 0) + gaps;
    if (total <= heightCm) break;
    scale = Math.max(0.4, scale * Math.sqrt(heightCm / total));
    measured = measure(parts, widthCm, scale);
  }
  const placed: PlacedPart[] = [];
  let y = top;
  parts.forEach((part, i) => {
    const h = measured.heights[i]!;
    if (part.kind === "text")
      placed.push({ kind: "text", lines: part.lines, y, h });
    else {
      const layout = measured.tables[i]!;
      const w = layout.widths.reduce((sum, width) => sum + width, 0);
      placed.push({
        kind: "table",
        table: part.table,
        x: left + Math.max(0, (widthCm - w) / 2),
        y,
        layout,
      });
    }
    y += h + PART_GAP_CM;
  });
  const last = placed.at(-1);
  if (last?.kind === "text")
    placed[placed.length - 1] = {
      ...last,
      h: Math.max(last.h, top + heightCm - last.y),
    };
  return { scale, parts: placed };
}
