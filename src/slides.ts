import {
  fitBlanks,
  metaValue,
  parseInline,
  type Block,
  type Inline,
} from "./markdown.ts";

export interface Slide {
  readonly title: Inline[] | null;
  readonly blocks: Block[];
  readonly notes: Block[];
  readonly section?: boolean;
}

export interface DeckMeta {
  readonly author?: string;
  readonly institute?: string;
  readonly date?: string;
}

export interface Deck {
  readonly title: Inline[] | null;
  readonly subtitle: Inline[][];
  readonly meta: DeckMeta;
  readonly slides: Slide[];
}

function isNotes(block: Block): boolean {
  return block.type === "div" && block.classes.includes("notes");
}

export function splitSlides(blocks: readonly Block[]): Deck {
  const head = blocks[0];
  const hasMeta = head?.type === "meta";
  const metaTitle = metaValue(head, "title");
  const metaSubtitle = metaValue(head, "subtitle");
  let title: Inline[] | null =
    metaTitle === undefined ? null : parseInline(metaTitle);
  const subtitle: Inline[][] =
    metaSubtitle === undefined ? [] : [parseInline(metaSubtitle)];
  const meta: DeckMeta = {
    author: metaValue(head, "author"),
    institute: metaValue(head, "institute"),
    date: metaValue(head, "date"),
  };
  const slides: Slide[] = [];
  let current: Slide | null = null;

  for (const b of fitBlanks(hasMeta ? blocks.slice(1) : blocks)) {
    if (b.type === "heading" && b.depth === 1 && hasMeta) {
      slides.push({ title: b.children, blocks: [], notes: [], section: true });
      current = null;
      continue;
    }
    if (b.type === "heading" && b.depth === 1 && title === null && !slides.length) {
      title = b.children;
      continue;
    }
    if (b.type === "heading" && b.depth <= 2) {
      current = { title: b.children, blocks: [], notes: [] };
      slides.push(current);
      continue;
    }
    if (b.type === "rule") {
      current = { title: null, blocks: [], notes: [] };
      slides.push(current);
      continue;
    }
    if (isNotes(b) && b.type === "div") {
      current?.notes.push(...b.children);
      continue;
    }
    if (current === null) {
      if (title !== null && !hasMeta && !slides.length && b.type === "paragraph") {
        subtitle.push(b.children);
        continue;
      }
      current = { title: null, blocks: [], notes: [] };
      slides.push(current);
    }
    current.blocks.push(b);
  }

  return { title, subtitle, meta, slides };
}
