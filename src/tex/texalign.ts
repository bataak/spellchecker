export const ALIGN_ENV = new Set([
  "tabular",
  "tabular*",
  "tabularx",
  "tabulary",
  "longtable",
  "array",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "flalign",
  "flalign*",
  "aligned",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
]);

const EDGE = /^[ \t]+|[ \t]+$/g;
const RELATION =
  /^(?:[=<>]|\\(?:le|ge|leq|geq|neq|ne|approx|equiv|sim|simeq|cong|to|mapsto|rightarrow|Rightarrow|leftrightarrow|Leftrightarrow|iff|implies|in|subset|subseteq|supset|supseteq)(?![a-zA-Z]))/;
const MATH_ALIGN = /^(?:align|alignat|flalign|aligned|split)\*?$/;

interface Row {
  readonly cells: string[];
  readonly breaks: number;
  readonly endsRow: boolean;
  readonly breakAt: number;
}

function scanRow(line: string): Row | null {
  const cells: string[] = [];
  let depth = 0;
  let from = 0;
  let breaks = 0;
  let lastBreak = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "%") return null;
    if (ch === "\\") {
      if (line[i + 1] === "\\" && depth === 0) {
        breaks++;
        lastBreak = i;
      }
      if (line.startsWith("verb", i + 1)) return null;
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "&" && depth === 0) {
      if (breaks > 0) return null;
      cells.push(line.slice(from, i));
      from = i + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  const tail = line.slice(from);
  cells.push(tail);
  const lead = tail.length - tail.replace(/^[ \t]+/, "").length;
  return {
    cells: cells.map((cell) => cell.replace(EDGE, "")),
    breaks,
    endsRow: lastBreak !== -1,
    breakAt: lastBreak === -1 ? -1 : lastBreak - from - lead,
  };
}

const width = (text: string): number => [...text].length;

function spaced(cell: string, breakAt: number): string {
  if (breakAt <= 0 || /[ \t]/.test(cell[breakAt - 1]!)) return cell;
  return cell.slice(0, breakAt) + " " + cell.slice(breakAt);
}

export function alignRows(
  lines: readonly string[],
  env: string,
): string[] | null {
  const rows = lines.map(scanRow);
  if (rows.some((row) => row === null)) return null;
  const real = rows as Row[];
  const cellRows = real.filter((row) => row.cells.length > 1);
  if (cellRows.length < 2) return null;
  if (real.some((row) => row.breaks > 1)) return null;
  const lastCells = real.lastIndexOf(cellRows[cellRows.length - 1]!);
  if (
    real.some(
      (row, i) => row.cells.length > 1 && !row.endsRow && i !== lastCells,
    )
  )
    return null;
  const math = MATH_ALIGN.test(env);
  const widths: number[] = [];
  for (const row of cellRows)
    row.cells.slice(0, -1).forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, width(cell));
    });
  return real.map((row, i) => {
    if (row.cells.length < 2) return lines[i]!.replace(EDGE, "");
    const last = row.cells.length - 1;
    const cells = [
      ...row.cells.slice(0, last),
      spaced(row.cells[last]!, row.breakAt),
    ];
    return cells
      .map((cell, k) => {
        const pad = k < last ? " ".repeat(widths[k]! - width(cell)) : "";
        if (k === 0) return cell + pad;
        return (math && RELATION.test(cell) ? "&" : "& ") + cell + pad;
      })
      .join(" ")
      .replace(/[ \t]+$/, "");
  });
}
