import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Line, TextItem } from "./pdftext.ts";
import type { PdfWord } from "../tex/texsync.ts";

export async function readPdfWords(
  doc: PDFDocumentProxy,
  margins: (number | null)[],
): Promise<readonly PdfWord[]> {
  const [{ pageLines, textLeft }, { pdfWords }] = await Promise.all([
    import("./pdftext.ts"),
    import("../tex/texsync.ts"),
  ]);
  const lines: Line[][] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    lines.push(pageLines(content.items as TextItem[]));
    heights.push(page.view[3]! - page.view[1]!);
    widths.push(page.view[2]! - page.view[0]!);
    margins[i - 1] = textLeft(lines[i - 1]!, widths[i - 1]!);
    page.cleanup();
  }
  return pdfWords(lines, heights, widths);
}
