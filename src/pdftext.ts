import { repairCyrillic } from "./cp1251.ts";

const MAX_PDF_MB = 30;

interface TextItem {
  str: string;
  hasEOL?: boolean;
  width?: number;
  transform?: number[];
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

interface Line {
  text: string;
  y: number;
}

interface Piece {
  str: string;
  x: number;
  width: number;
}

const SPACE_GAP_RATIO = 0.28;

function wordStarts(text: string): number[] {
  const starts = [0];
  for (let i = 1; i < text.length; i++) {
    if (text[i - 1] === " " && text[i] !== " ") starts.push(i);
  }
  starts.push(text.length);
  return starts;
}

function insertAt(host: string, guest: string, ratio: number): string {
  const estimate = Math.round(ratio * host.length);
  const starts = wordStarts(host);
  let best = starts[0]!;
  for (const candidate of starts) {
    if (Math.abs(candidate - estimate) < Math.abs(best - estimate))
      best = candidate;
  }
  return host.slice(0, best) + guest + host.slice(best);
}

function mergePieces(pieces: Piece[]): string {
  const ordered = pieces.slice().sort((a, b) => a.x - b.x);
  const hosts = ordered.filter((piece) => piece.width > 0);
  const floating = ordered.filter((piece) => piece.width <= 0);
  const used = new Set<Piece>();
  for (const guest of floating) {
    const host = hosts.find(
      (candidate) =>
        guest.x > candidate.x && guest.x < candidate.x + candidate.width,
    );
    if (!host) continue;
    host.str = insertAt(host.str, guest.str, (guest.x - host.x) / host.width);
    used.add(guest);
  }
  const kept = ordered.filter((piece) => !used.has(piece));
  let totalWidth = 0;
  let totalChars = 0;
  for (const piece of kept) {
    if (piece.width > 0 && piece.str.trim()) {
      totalWidth += piece.width;
      totalChars += piece.str.length;
    }
  }
  const averageChar = totalChars ? totalWidth / totalChars : 0;
  const minGap = averageChar * SPACE_GAP_RATIO;
  const solid = kept.filter((piece) => piece.str.trim() !== "");
  let out = "";
  let previousEnd: number | null = null;
  for (const piece of solid) {
    if (previousEnd !== null) {
      const gap = piece.x - previousEnd;
      const joined = out.endsWith(" ") || piece.str.startsWith(" ");
      if (!joined && (averageChar === 0 || gap > minGap)) out += " ";
    }
    out += piece.str;
    previousEnd = piece.x + piece.width;
  }
  return out;
}

function pageLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let pieces: Piece[] = [];
  let y: number | null = null;
  const flush = (): void => {
    if (pieces.length) {
      const text = mergePieces(pieces);
      if (text.trim()) lines.push({ text: text.trim(), y: y ?? 0 });
    }
    pieces = [];
    y = null;
  };
  for (const item of items) {
    const itemY = item.transform ? item.transform[5]! : null;
    const itemX = item.transform ? item.transform[4]! : 0;
    if (y !== null && itemY !== null && Math.abs(itemY - y) > 1) flush();
    if (y === null && itemY !== null) y = itemY;
    if (item.str)
      pieces.push({ str: item.str, x: itemX, width: item.width ?? 0 });
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

const PARAGRAPH_GAP_RATIO = 1.35;

const BULLET_RE =
  /^(?:[\u2022\u25E6\u25AA\u2023\u00B7\u2219*]|[-\u2013\u2014]\s|\d+(?:\.\d+)*[.)]\s|\d+(?:\.\d+)*\s+\p{Lu})/u;

function startsBlock(text: string): boolean {
  return BULLET_RE.test(text);
}

function joinLine(previous: string, next: string): string {
  if (previous.endsWith("\u00AD")) return previous.slice(0, -1) + next;
  if (previous.endsWith("-")) return previous + next;
  return previous + " " + next;
}

interface Block {
  text: string;
  bullet: boolean;
}

function mergeParagraphs(lines: Line[]): Block[] {
  if (!lines.length) return [];
  if (lines.length < 3) {
    return lines.map((line) => ({
      text: line.text,
      bullet: startsBlock(line.text),
    }));
  }
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1]!.y - lines[i]!.y;
    if (gap > 0) gaps.push(gap);
  }
  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const out: Block[] = [];
  let current = lines[0]!.text;
  let bullet = startsBlock(current);
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1]!.y - lines[i]!.y;
    const next = lines[i]!.text;
    const nextBullet = startsBlock(next);
    const breakHere =
      gap <= 0 ||
      (median > 0 && gap > median * PARAGRAPH_GAP_RATIO) ||
      nextBullet;
    if (breakHere) {
      out.push({ text: current, bullet });
      current = next;
      bullet = nextBullet;
    } else {
      current = joinLine(current, next);
    }
  }
  out.push({ text: current, bullet });
  return out;
}

function assemble(blocks: Block[]): string {
  let out = "";
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (i === 0) out = block.text;
    else out += (block.bullet ? "\n" : "\n\n") + block.text;
  }
  return out;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u00AD/g, "")
    .trim();
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  if (file.size > MAX_PDF_MB * 1024 * 1024)
    throw new Error("too-large:" + MAX_PDF_MB);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pages: string[] = [];
  try {
    const doc = await loadingTask.promise;
    for (let index = 1; index <= doc.numPages; index++) {
      if (onProgress) onProgress(index, doc.numPages);
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      const blocks = mergeParagraphs(pageLines(content.items as TextItem[]));
      if (blocks.length) pages.push(assemble(blocks));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  const text = repairCyrillic(tidy(pages.join("\n\n")));
  if (!text) throw new Error("no-text");
  return text;
}
