import { type Block } from "../markdown.ts";
import { usesOverlay } from "./texbeamer.ts";
import { type Slide, splitSlides } from "../doc/slides.ts";
import { oneLine, inline } from "./latexinline.ts";
import { block, BEAMER_BLOCK, noteBlocks } from "./latexblocks.ts";
import { BEAMER_PREAMBLE, metaText, exportExtras } from "./latex.ts";

const NOTES_SCREEN = `\\usepackage{pgfpages}
\\setbeameroption{show notes on second screen=right}
`;

function hasVerbatim(blocks: readonly Block[]): boolean {
  return blocks.some((b) => {
    if (b.type === "codeblock") return true;
    if (b.type === "latex") return b.env === "verbatim";
    return (b.type === "div" || b.type === "quote") && hasVerbatim(b.children);
  });
}

function hasOverlay(blocks: readonly Block[]): boolean {
  return blocks.some((b) => {
    if (b.type === "latex") return usesOverlay(b.value);
    return (b.type === "div" || b.type === "quote") && hasOverlay(b.children);
  });
}

function frame(slide: Slide): string {
  if (slide.section)
    return (
      "\\section{" +
      oneLine(slide.title ?? []) +
      "}\n\\begin{frame}\n\\sectionpage\n\\end{frame}"
    );
  const fragile = hasVerbatim(slide.blocks)
    ? hasOverlay(slide.blocks)
      ? "[fragile]"
      : "[fragile=singleslide]"
    : "";
  const body = slide.blocks
    .map((b) =>
      b.type === "heading"
        ? "\\textbf{" + oneLine(b.children) + "}\\par"
        : block(b, BEAMER_BLOCK),
    )
    .filter((text) => text !== "")
    .join("\n\n");
  const notes = slide.notes.length
    ? "\n\\note{" +
      noteBlocks(slide.notes)
        .map((b) => block(b, BEAMER_BLOCK))
        .join("\n\n") +
      "}"
    : "";
  return (
    "\\begin{frame}" +
    fragile +
    (slide.title === null ? "" : "{" + oneLine(slide.title) + "}") +
    "\n" +
    body +
    notes +
    "\n\\end{frame}"
  );
}

export interface BeamerOptions {
  readonly notesScreen?: boolean;
}

export function toBeamer(
  blocks: readonly Block[],
  preamble: string = BEAMER_PREAMBLE,
  options: BeamerOptions = {},
): string {
  const deck = splitSlides(blocks);
  const parts = [
    preamble.replace(/\s*$/, "\n") + (options.notesScreen ? NOTES_SCREEN : ""),
  ];
  if (deck.title !== null) {
    let head = "\\title{" + oneLine(deck.title) + "}\n";
    if (deck.subtitle.length)
      head += "\\subtitle{" + deck.subtitle.map(inline).join(" \\\\ ") + "}\n";
    const author = metaText(deck.meta.author);
    const institute = metaText(deck.meta.institute);
    const date = metaText(deck.meta.date);
    if (author !== null) head += "\\author{" + author + "}\n";
    if (institute !== null) head += "\\institute{" + institute + "}\n";
    if (date !== null) head += "\\date{" + date + "}\n";
    parts.push(head);
  }
  parts.push("\\begin{document}\n");
  if (deck.title !== null)
    parts.push("\\begin{frame}\n\\titlepage\n\\end{frame}\n");
  for (const slide of deck.slides) parts.push(frame(slide) + "\n");
  parts.push("\\end{document}\n");
  if (preamble === BEAMER_PREAMBLE)
    parts.splice(1, 0, exportExtras(parts.slice(1).join("\n"), true));
  return parts.join("\n");
}
