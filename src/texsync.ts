import type { Line } from "./pdftext.ts";

export interface SourceWord {
  readonly word: string;
  readonly at: number;
}

export interface PdfWord {
  readonly word: string;
  readonly page: number;
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
): PdfWord[] {
  const out: PdfWord[] = [];
  let carry = "";
  pages.forEach((lines, index) => {
    const page = index + 1;
    const height = heights[index] || 1;
    for (const line of lines) {
      const y = Math.min(Math.max(1 - line.y / height, 0), 1);
      const words = [...line.text.matchAll(WORD)].map((m) => m[0]);
      if (carry) words[0] = carry + (words[0] ?? "");
      carry = /[-\u2010\u00AD]$/.test(line.text) ? (words.pop() ?? "") : "";
      for (const word of words) out.push({ word: norm(word), page, y });
    }
  });
  if (carry) {
    const last = out[out.length - 1];
    out.push({ word: norm(carry), page: last?.page ?? 1, y: last?.y ?? 0 });
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
  const center = nearestWord(source, caret);
  const index = new Map<string, number[]>();
  pdf.forEach((w, i) => {
    const list = index.get(w.word);
    if (list) list.push(i);
    else index.set(w.word, [i]);
  });

  const candidates = new Set<number>();
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const word = source[center + d];
    if (!word) continue;
    for (const j of index.get(word.word) ?? []) candidates.add(j - d);
  }

  const score = (p: number): number => {
    let total = 0;
    for (let d = -WINDOW; d <= WINDOW; d++) {
      const word = source[center + d];
      if (!word) continue;
      const weight = d === 0 ? 1.5 : 1;
      if (pdf[p + d]?.word === word.word) {
        total += weight;
        continue;
      }
      for (let e = 1; e <= SLACK; e++) {
        if (
          pdf[p + d - e]?.word === word.word ||
          pdf[p + d + e]?.word === word.word
        ) {
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
    const { before, total } = repeats(source, center);
    if (tied.length >= total)
      best = tied[tied.length - total + Math.min(before, total - 1)]!;
    else {
      const expected = (center / source.length) * pdf.length;
      best = tied.reduce((x, y) =>
        Math.abs(y - expected) < Math.abs(x - expected) ? y : x,
      );
    }
  }
  return pdf[Math.min(Math.max(best, 0), pdf.length - 1)]!;
}

function repeats(
  source: readonly SourceWord[],
  center: number,
): { before: number; total: number } {
  const from = Math.max(center - WINDOW, 0);
  const to = Math.min(center + WINDOW, source.length - 1);
  let before = 0;
  let total = 0;
  for (let q = 0; q < source.length; q++) {
    let same = true;
    for (let i = from; i <= to && same; i++)
      same = source[q + i - center]?.word === source[i]!.word;
    if (!same) continue;
    total++;
    if (q < center) before++;
  }
  return { before, total: Math.max(total, 1) };
}
