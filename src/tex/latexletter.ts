import type { Block, Inline } from "../markdown.ts";

export const LETTER_PAGE = `\\usepackage[a4paper,top=2cm,bottom=2cm,left=3cm,right=1.5cm]{geometry}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{6pt}
\\linespread{1.1}`;

export function letterTitle(
  blocks: readonly Block[],
  oneLine: (nodes: readonly Inline[]) => string,
): Block[] {
  let done = false;
  const visit = (list: readonly Block[]): Block[] =>
    list.map((b): Block => {
      if (done) return b;
      if (b.type === "div") return { ...b, children: visit(b.children) };
      if (b.type !== "heading" || oneLine(b.children).trim() === "") return b;
      done = true;
      return {
        type: "latex",
        env: "letter-title",
        value:
          "{\\centering\\large\\bfseries " +
          oneLine(b.children) +
          "\\par}\n\\medskip",
        line: b.line,
      };
    });
  return visit(blocks);
}
