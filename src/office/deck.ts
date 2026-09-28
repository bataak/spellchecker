import {
  isBlankRow,
  parseInline,
  type Block,
  type Inline,
} from "../markdown.ts";
import type { Deck } from "../slides.ts";
import { guillemets } from "./apply.ts";
import type { Align, IrRun } from "./docir.ts";
import { flatten } from "./flatten.ts";

export type LineKind = "para" | "bullet" | "number";

export interface DeckLine {
  readonly kind: LineKind;
  readonly start?: number;
  readonly runs: readonly IrRun[];
}

export interface DeckTable {
  readonly header: boolean;
  readonly align: readonly (Align | null)[];
  readonly rows: readonly (readonly (readonly IrRun[])[])[];
}

export type DeckPart =
  | { readonly kind: "text"; readonly lines: readonly DeckLine[] }
  | { readonly kind: "table"; readonly table: DeckTable };

export interface DeckSlide {
  readonly title: readonly IrRun[] | null;
  readonly lines: readonly DeckLine[];
  readonly parts: readonly DeckPart[];
  readonly notes: readonly DeckLine[];
  readonly section?: boolean;
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

const ALIGN: Readonly<Record<string, Align>> = {
  left: "start",
  center: "center",
  right: "end",
};

function deckTable(block: Extract<Block, { type: "table" }>): DeckTable {
  const blank = isBlankRow(block.rows[0]);
  return {
    header: !blank,
    align: block.align.map((value) => (value ? ALIGN[value]! : null)),
    rows: (blank ? block.rows.slice(1) : block.rows).map((row) =>
      row.map(runs),
    ),
  };
}

function parts(blocks: readonly Block[]): DeckPart[] {
  const out: DeckPart[] = [];
  let pending: Block[] = [];
  const flush = (): void => {
    const text = lines(pending);
    if (text.length) out.push({ kind: "text", lines: text });
    pending = [];
  };
  const visit = (list: readonly Block[]): void => {
    for (const b of list) {
      if (b.type === "table") {
        flush();
        out.push({ kind: "table", table: deckTable(b) });
      } else if (b.type === "div" && !b.classes.includes("notes"))
        visit(b.children);
      else pending.push(b);
    }
  };
  visit(blocks);
  flush();
  return out;
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
    else if (b.type === "div") {
      if (!b.classes.includes("notes")) out.push(...lines(b.children));
    } else if (b.type === "quote")
      for (const line of lines(b.children))
        out.push({ ...line, runs: mark(line.runs, { italic: true }) });
    else if (
      b.type === "codeblock" ||
      b.type === "math" ||
      b.type === "latex"
    )
      for (const text of b.value.split("\n"))
        out.push({ kind: "para", runs: [{ text, mono: true }] });
    else if (b.type === "table")
      b.rows.forEach((row, index) => {
        if (index === 0 && isBlankRow(row)) return;
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
  const meta = [deck.meta.author, deck.meta.institute, deck.meta.date]
    .filter((value): value is string => value !== undefined && value !== "")
    .map((value) => runs(parseInline(value)));
  return {
    title: deck.title === null ? null : runs(deck.title),
    subtitle: [...deck.subtitle.map(runs), ...meta],
    slides: deck.slides.map((slide) => ({
      title: slide.title === null ? null : runs(slide.title),
      lines: lines(slide.blocks),
      parts: parts(slide.blocks),
      notes: lines(slide.notes),
      ...(slide.section ? { section: true } : {}),
    })),
  };
}
