import type { IrRun } from "./docir.ts";
import { TIMES_BOLD, TIMES_CHARS, TIMES_REGULAR } from "./times.ts";

export interface TextMetrics {
  readonly width: (text: string, bold: boolean) => number;
  readonly padCm: number;
  readonly capCm: number;
  readonly wrapHeader: boolean;
}

const LATEX_CHAR_CM = 0.24;

export const LATEX_METRICS: TextMetrics = {
  width: (text) => text.length * LATEX_CHAR_CM,
  padCm: 0.6,
  capCm: 40 * LATEX_CHAR_CM,
  wrapHeader: true,
};

const GLYPH_INDEX = new Map(
  [...TIMES_CHARS].map((char, index) => [char, index] as const),
);

export function glyphWidth(
  regular: readonly number[],
  boldWidths: readonly number[],
): (text: string, bold: boolean, pt: number) => number {
  return (text, bold, pt) => {
    const table = bold ? boldWidths : regular;
    let em = 0;
    for (const char of text) {
      const index = GLYPH_INDEX.get(char);
      em += index === undefined ? 600 : table[index]!;
    }
    return (em / 1000) * (pt / 72) * 2.54;
  };
}

const OFFICE_PT = 11;

const timesWidth = glyphWidth(TIMES_REGULAR, TIMES_BOLD);

export const OFFICE_METRICS: TextMetrics = {
  width: (text, bold) => timesWidth(text, bold, OFFICE_PT),
  padCm: 0.3,
  capCm: 8,
  wrapHeader: false,
};

const MIN_CM = 1;

function longestWord(
  runs: readonly IrRun[],
  bold: boolean,
  metrics: TextMetrics,
): number {
  let widest = 0;
  for (const run of runs)
    for (const word of run.text.split(/\s+/))
      widest = Math.max(widest, metrics.width(word, bold || run.bold === true));
  return widest;
}

function fullWidth(
  runs: readonly IrRun[],
  bold: boolean,
  metrics: TextMetrics,
): number {
  const total = runs.reduce(
    (sum, run, index) =>
      sum +
      metrics.width(
        index === 0
          ? run.text.trimStart()
          : index === runs.length - 1
            ? run.text.trimEnd()
            : run.text,
        bold || run.bold === true,
      ),
    0,
  );
  return Math.min(total, metrics.capCm);
}

export function columnWidths(
  rows: readonly (readonly (readonly IrRun[])[])[],
  header: boolean,
  availableCm: number,
  metrics: TextMetrics = LATEX_METRICS,
): number[] {
  const count = Math.max(1, ...rows.map((row) => row.length));
  const size = (cm: number): number => Math.max(MIN_CM, cm + metrics.padCm);
  const minimum: number[] = [];
  const natural: number[] = [];
  for (let column = 0; column < count; column += 1) {
    let word = 0;
    let full = 0;
    rows.forEach((row, index) => {
      const runs = row[column] ?? [];
      const head = header && index === 0;
      const longest = longestWord(runs, head, metrics);
      word = Math.max(word, longest);
      full = Math.max(
        full,
        head && metrics.wrapHeader ? longest : fullWidth(runs, head, metrics),
      );
    });
    minimum.push(size(word));
    natural.push(size(Math.max(word, full)));
  }
  const sum = (list: readonly number[]): number =>
    list.reduce((total, width) => total + width, 0);
  const round = (width: number): number => Math.round(width * 100) / 100;
  if (sum(natural) <= availableCm) return natural.map(round);
  const floor = sum(minimum);
  if (floor >= availableCm)
    return minimum.map((width) => round((width * availableCm) / floor));
  const spare = availableCm - floor;
  const stretch = sum(natural) - floor;
  return minimum.map((width, i) =>
    round(width + (spare * (natural[i]! - width)) / stretch),
  );
}
