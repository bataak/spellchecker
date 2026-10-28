export type TableRules = "lines" | "grid";

export interface TableLook {
  readonly share: number | null;
  readonly rules: TableRules | null;
  readonly rowCm: number | null;
}

export type Stroke = 0 | 1 | 2;

export const STROKE_PT: Readonly<Record<Stroke, number>> = {
  0: 0,
  1: 0.5,
  2: 1,
};

export interface TableStrokes {
  readonly top: Stroke;
  readonly head: Stroke;
  readonly rows: Stroke;
  readonly bottom: Stroke;
  readonly columns: Stroke;
  readonly sides: Stroke;
}

export interface CellStrokes {
  readonly top: Stroke;
  readonly bottom: Stroke;
  readonly left: Stroke;
  readonly right: Stroke;
}

export interface CellPlace {
  readonly row: number;
  readonly rows: number;
  readonly column: number;
  readonly columns: number;
}

export function tableShare(width: string | undefined): number | null {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(width ?? "");
  if (!match) return null;
  const share = Number(match[1]) / 100;
  return share > 0 ? Math.min(1, share) : null;
}

export function tableRow(height: string | undefined): number | null {
  const match = /^(\d+(?:\.\d+)?)(cm|mm)$/.exec(height ?? "");
  if (!match) return null;
  const size = Number(match[1]) / (match[2] === "mm" ? 10 : 1);
  return size > 0 ? Math.min(10, size) : null;
}

export function tableLook(
  classes: readonly string[],
  keys: Readonly<Record<string, string>>,
): TableLook {
  return {
    share: classes.includes("column") ? null : tableShare(keys["width"]),
    rules: classes.includes("grid")
      ? "grid"
      : classes.includes("lines")
        ? "lines"
        : null,
    rowCm: tableRow(keys["row"]),
  };
}

export function tableStrokes(
  rules: TableRules | null | undefined,
  header: boolean,
): TableStrokes {
  if (rules === "grid")
    return { top: 1, head: 1, rows: 1, bottom: 1, columns: 1, sides: 1 };
  const lines: Stroke = rules === "lines" ? 1 : 0;
  return header
    ? { top: 2, head: 1, rows: lines, bottom: 2, columns: 0, sides: 0 }
    : { top: 0, head: lines, rows: lines, bottom: lines, columns: 0, sides: 0 };
}

export function cellStrokes(
  strokes: TableStrokes,
  place: CellPlace,
): CellStrokes {
  const below = place.row === 0 ? strokes.head : strokes.rows;
  return {
    top: place.row === 0 ? strokes.top : 0,
    bottom: place.row === place.rows - 1 ? strokes.bottom : below,
    left: place.column === 0 ? strokes.sides : 0,
    right: place.column === place.columns - 1 ? strokes.sides : strokes.columns,
  };
}

export function strokeClasses(cell: CellStrokes): string {
  return (["top", "bottom", "left", "right"] as const)
    .filter((side) => cell[side] > 0)
    .map((side) => "e-" + side[0]! + String(cell[side]))
    .join(" ");
}
