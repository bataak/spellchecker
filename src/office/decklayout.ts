import type { DeckLine, DeckPart, DeckTable } from "./deck.ts";
import type { IrImage, IrRun } from "./docir.ts";
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
const IMAGE_GAP_CM = 0.4;

export type ImageSizes = (
  image: IrImage,
) => { readonly widthPx: number; readonly heightPx: number } | undefined;

export interface PlacedImage {
  readonly image: IrImage;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface SizedImage {
  readonly image: IrImage;
  readonly w: number;
  readonly h: number;
}

function imageRow(
  images: readonly IrImage[],
  widthCm: number,
  heightCm: number,
  sizes: ImageSizes,
): SizedImage[] {
  const known = images.flatMap((image) => {
    const size = sizes(image);
    return size && size.widthPx > 0
      ? [{ image, ratio: size.heightPx / size.widthPx }]
      : [];
  });
  const room = widthCm - IMAGE_GAP_CM * Math.max(0, known.length - 1);
  const fixed = known.reduce(
    (sum, { image }) => sum + (widthCm * (image.widthPercent ?? 0)) / 100,
    0,
  );
  const auto = known.filter(({ image }) => image.widthPercent === undefined);
  const share = auto.length
    ? (room - fixed > 0 ? room - fixed : room) / auto.length
    : 0;
  const row = known.map(({ image, ratio }) => {
    const w =
      image.widthPercent !== undefined
        ? (widthCm * image.widthPercent) / 100
        : share;
    return { image, w, h: w * ratio };
  });
  const total = row.reduce((sum, item) => sum + item.w, 0);
  const tallest = Math.max(0, ...row.map((item) => item.h));
  const fit = Math.min(
    1,
    total > 0 ? room / total : 1,
    tallest > 0 ? heightCm / tallest : 1,
  );
  return row.map((item) => ({ ...item, w: item.w * fit, h: item.h * fit }));
}

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
    }
  | { readonly kind: "image"; readonly items: readonly PlacedImage[] };

export interface SlideLayout {
  readonly scale: number;
  readonly parts: readonly PlacedPart[];
}

function measure(
  parts: readonly DeckPart[],
  widthCm: number,
  scale: number,
  rows: readonly (SizedImage[] | null)[],
): { heights: number[]; tables: (TableLayout | null)[] } {
  const heights: number[] = [];
  const tables: (TableLayout | null)[] = [];
  for (const [i, part] of parts.entries()) {
    if (part.kind === "text") {
      heights.push(textHeight(part.lines, widthCm, TEXT_PT * scale));
      tables.push(null);
    } else if (part.kind === "image") {
      heights.push(scale * Math.max(0, ...rows[i]!.map((item) => item.h)));
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
  all: readonly DeckPart[],
  left: number,
  top: number,
  widthCm: number,
  heightCm: number,
  sizes: ImageSizes = () => undefined,
): SlideLayout {
  const sized = all.map((part) =>
    part.kind === "image"
      ? imageRow(part.images, widthCm, heightCm, sizes)
      : null,
  );
  const parts = all.filter((_, i) => sized[i] === null || sized[i]!.length);
  const rows = sized.filter((row) => row === null || row.length);
  const gaps = PART_GAP_CM * Math.max(0, parts.length - 1);
  let scale = 1;
  let measured = measure(parts, widthCm, scale, rows);
  for (let step = 0; step < 8; step += 1) {
    const total = measured.heights.reduce((sum, h) => sum + h, 0) + gaps;
    if (total <= heightCm) break;
    scale = Math.max(0.4, scale * Math.sqrt(heightCm / total));
    measured = measure(parts, widthCm, scale, rows);
  }
  const placed: PlacedPart[] = [];
  let y = top;
  parts.forEach((part, i) => {
    const h = measured.heights[i]!;
    if (part.kind === "text")
      placed.push({ kind: "text", lines: part.lines, y, h });
    else if (part.kind === "image") {
      const row = rows[i]!;
      const w =
        scale * row.reduce((sum, item) => sum + item.w, 0) +
        IMAGE_GAP_CM * (row.length - 1);
      let x = left + Math.max(0, (widthCm - w) / 2);
      placed.push({
        kind: "image",
        items: row.map((item) => {
          const at = {
            image: item.image,
            x,
            y: y + (h - scale * item.h) / 2,
            w: scale * item.w,
            h: scale * item.h,
          };
          x += at.w + IMAGE_GAP_CM;
          return at;
        }),
      });
    } else {
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
