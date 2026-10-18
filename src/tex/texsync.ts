import type { Line } from "../preview/pdftext.ts";

export interface SourceWord {
  readonly word: string;
  readonly at: number;
}

export interface PdfWord {
  readonly word: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

const HIDDEN_ARG =
  /\\(?:label|ref|eqref|pageref|autoref|cref|cite[a-z]*|begin|end|includegraphics|usepackage|RequirePackage|documentclass|input|include|bibliography|bibliographystyle|addbibresource|vspace|hspace|setlength|newcommand|renewcommand|newenvironment|graphicspath|pagestyle|thispagestyle)\*?(?:\s*\[[^\]\n]*\])*(?:\s*\{[^{}\n]*\}(?:\s*\[[^\]\n]*\])*)?/g;
const COMMAND = /\\(?:[A-Za-z@]+|.)/g;
const COMMENT = /(^|[^\\])%.*$/gm;
const WORD = /[\p{L}\p{N}]+/gu;
const WINDOW = 4;
const SLACK = 2;

function blank(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

function norm(word: string): string {
  return word.normalize("NFKC").toLowerCase();
}

export function sourceWords(text: string): SourceWord[] {
  const plain = text
    .replace(
      COMMENT,
      (match, lead: string) => lead + blank(match.slice(lead.length)),
    )
    .replace(HIDDEN_ARG, blank)
    .replace(COMMAND, blank);
  const out: SourceWord[] = [];
  for (const match of plain.matchAll(WORD)) {
    if (match[0].length < 2) continue;
    out.push({ word: norm(match[0]), at: match.index });
  }
  return out;
}

export function pdfWords(
  pages: readonly (readonly Line[])[],
  heights: readonly number[],
  widths: readonly number[] = [],
): PdfWord[] {
  const out: PdfWord[] = [];
  let carry: { head: string; x: number } | null = null;
  pages.forEach((lines, index) => {
    const page = index + 1;
    const height = heights[index] || 1;
    const width = widths[index] || 0;
    for (const line of lines) {
      const y = Math.min(Math.max(1 - line.y / height, 0), 1);
      const left = line.left ?? 0;
      const span = (line.right ?? left) - left;
      const xAt = (at: number, length: number): number =>
        width && span > 0
          ? Math.min(
              Math.max(
                (left + ((at + length / 2) / line.text.length) * span) / width,
                0,
              ),
              1,
            )
          : 0.5;
      const words = [...line.text.matchAll(WORD)].map((m) => ({
        word: m[0],
        x: xAt(m.index, m[0].length),
      }));
      if (carry) {
        const first = words.shift();
        out.push({
          word: norm(carry.head + (first?.word ?? "")),
          page,
          x: carry.x,
          y,
        });
      }
      carry = null;
      if (/[-\u2010\u00AD]$/.test(line.text)) {
        const last = words.pop();
        if (last) carry = { head: last.word, x: last.x };
      }
      for (const word of words)
        out.push({ word: norm(word.word), page, x: word.x, y });
    }
  });
  if (carry) {
    const tail: { head: string; x: number } = carry;
    const last = out[out.length - 1];
    out.push({
      word: norm(tail.head),
      page: last?.page ?? 1,
      x: tail.x,
      y: last?.y ?? 0,
    });
  }
  return out.filter((w) => w.word.length >= 2);
}

function nearestWord(words: readonly SourceWord[], caret: number): number {
  let low = 0;
  let high = words.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (words[mid]!.at + words[mid]!.word.length < caret) low = mid + 1;
    else high = mid;
  }
  if (low > 0) {
    const before = words[low - 1]!;
    const after = words[low]!;
    if (caret - (before.at + before.word.length) < after.at - caret)
      return low - 1;
  }
  return low;
}

export function locate(
  source: readonly SourceWord[],
  caret: number,
  pdf: readonly PdfWord[],
): PdfWord | null {
  if (!source.length || !pdf.length) return null;
  const at = align(
    source.map((w) => w.word),
    nearestWord(source, caret),
    pdf.map((w) => w.word),
    true,
  );
  return at === null ? null : pdf[at]!;
}

export function locateSource(
  source: readonly SourceWord[],
  pdf: readonly PdfWord[],
  index: number,
): SourceWord | null {
  if (!source.length || !pdf[index]) return null;
  const at = align(
    pdf.map((w) => w.word),
    index,
    source.map((w) => w.word),
    false,
  );
  return at === null ? null : source[at]!;
}

export function pdfWordAt(
  pdf: readonly PdfWord[],
  page: number,
  x: number,
  y: number,
): number {
  let line = Infinity;
  for (const w of pdf)
    if (w.page === page) line = Math.min(line, Math.abs(w.y - y));
  if (line === Infinity) return -1;
  let best = -1;
  let gap = Infinity;
  pdf.forEach((w, i) => {
    if (w.page !== page || Math.abs(w.y - y) > line + 0.004) return;
    const dx = Math.abs(w.x - x);
    if (dx < gap) {
      gap = dx;
      best = i;
    }
  });
  return best;
}

function align(
  from: readonly string[],
  center: number,
  to: readonly string[],
  extraFirst: boolean,
): number | null {
  const index = new Map<string, number[]>();
  to.forEach((word, i) => {
    const list = index.get(word);
    if (list) list.push(i);
    else index.set(word, [i]);
  });

  const candidates = new Set<number>();
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const word = from[center + d];
    if (word === undefined) continue;
    for (const j of index.get(word) ?? []) candidates.add(j - d);
  }

  const score = (p: number): number => {
    let total = 0;
    for (let d = -WINDOW; d <= WINDOW; d++) {
      const word = from[center + d];
      if (word === undefined) continue;
      const weight = d === 0 ? 1.5 : 1;
      if (to[p + d] === word) {
        total += weight;
        continue;
      }
      for (let e = 1; e <= SLACK; e++) {
        if (to[p + d - e] === word || to[p + d + e] === word) {
          total += weight * 0.75;
          break;
        }
      }
    }
    return total;
  };

  let top = 0;
  const scored: [number, number][] = [];
  for (const p of candidates) {
    const value = score(p);
    scored.push([p, value]);
    if (value > top) top = value;
  }
  if (top < 1) return null;
  const tied = scored
    .filter(([, value]) => value === top)
    .map(([p]) => p)
    .sort((x, y) => x - y);

  let best: number;
  if (tied.length === 1) best = tied[0]!;
  else {
    const { before, total } = repeats(from, center);
    if (tied.length === total) best = tied[before]!;
    else if (tied.length > total && extraFirst)
      best = tied[tied.length - total + Math.min(before, total - 1)]!;
    else {
      const expected = (center / from.length) * to.length;
      best = tied.reduce((x, y) =>
        Math.abs(y - expected) < Math.abs(x - expected) ? y : x,
      );
    }
  }
  return Math.min(Math.max(best, 0), to.length - 1);
}

function repeats(
  words: readonly string[],
  center: number,
): { before: number; total: number } {
  const from = Math.max(center - WINDOW, 0);
  const to = Math.min(center + WINDOW, words.length - 1);
  let before = 0;
  let total = 0;
  for (let q = 0; q < words.length; q++) {
    let same = true;
    for (let i = from; i <= to && same; i++)
      same = words[q + i - center] === words[i];
    if (!same) continue;
    total++;
    if (q < center) before++;
  }
  return { before, total: Math.max(total, 1) };
}
