import type { Block, Inline } from "../markdown.ts";
import type { Deck } from "../slides.ts";
import { guillemets } from "./apply.ts";
import type { IrRun } from "./docir.ts";
import { flatten } from "./flatten.ts";

export type LineKind = "para" | "bullet" | "number";

export interface DeckLine {
  readonly kind: LineKind;
  readonly start?: number;
  readonly runs: readonly IrRun[];
}

export interface DeckSlide {
  readonly title: readonly IrRun[] | null;
  readonly lines: readonly DeckLine[];
}

export interface DeckDoc {
  readonly title: readonly IrRun[] | null;
  readonly subtitle: readonly (readonly IrRun[])[];
  readonly slides: readonly DeckSlide[];
}

function runs(children: readonly Inline[]): IrRun[] {
  return flatten(children).map((run) =>
    run.mono ? run : { ...run, text: guillemets(run.text) },
  );
}

function mark(list: readonly IrRun[], extra: Partial<IrRun>): IrRun[] {
  return list.map((run) => ({ ...run, ...extra }));
}

function lines(blocks: readonly Block[]): DeckLine[] {
  const out: DeckLine[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") out.push({ kind: "para", runs: runs(b.children) });
    else if (b.type === "heading")
      out.push({ kind: "para", runs: mark(runs(b.children), { bold: true }) });
    else if (b.type === "list")
      b.items.forEach((item, index) =>
        out.push(
          b.ordered
            ? {
                kind: "number",
                runs: runs(item),
                ...(index === 0 ? { start: b.start } : {}),
              }
            : { kind: "bullet", runs: runs(item) },
        ),
      );
    else if (b.type === "quote")
      for (const line of lines(b.children))
        out.push({ ...line, runs: mark(line.runs, { italic: true }) });
    else if (b.type === "codeblock")
      for (const text of b.value.split("\n"))
        out.push({ kind: "para", runs: [{ text, mono: true }] });
    else if (b.type === "table")
      b.rows.forEach((row, index) => {
        const cells: IrRun[] = [];
        row.forEach((cell, i) => {
          if (i > 0) cells.push({ text: " | " });
          cells.push(...runs(cell));
        });
        out.push({
          kind: "para",
          runs: index === 0 ? mark(cells, { bold: true }) : cells,
        });
      });
  }
  return out;
}

export function deckDoc(deck: Deck): DeckDoc {
  return {
    title: deck.title === null ? null : runs(deck.title),
    subtitle: deck.subtitle.map(runs),
    slides: deck.slides.map((slide) => ({
      title: slide.title === null ? null : runs(slide.title),
      lines: lines(slide.blocks),
    })),
  };
}
