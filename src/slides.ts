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

interface DeckBuilder {
  readonly hasMeta: boolean;
  title: Inline[] | null;
  readonly subtitle: Inline[][];
  readonly slides: Slide[];
  current: Slide | null;
}

function startSlide(d: DeckBuilder, title: Inline[] | null): Slide {
  const slide: Slide = { title, blocks: [], notes: [] };
  d.slides.push(slide);
  d.current = slide;
  return slide;
}

function placeHeading(d: DeckBuilder, b: Block): boolean {
  if (b.type !== "heading") return false;
  if (b.depth === 1 && d.hasMeta) {
    d.slides.push({ title: b.children, blocks: [], notes: [], section: true });
    d.current = null;
    return true;
  }
  if (b.depth === 1 && d.title === null && !d.slides.length) {
    d.title = b.children;
    return true;
  }
  if (b.depth > 2) return false;
  startSlide(d, b.children);
  return true;
}

function isSubtitle(d: DeckBuilder, b: Block): boolean {
  return (
    d.current === null &&
    d.title !== null &&
    !d.hasMeta &&
    !d.slides.length &&
    b.type === "paragraph"
  );
}

function placeBlock(d: DeckBuilder, b: Block): void {
  if (placeHeading(d, b)) return;
  if (b.type === "rule" || b.type === "pagebreak") {
    startSlide(d, null);
    return;
  }
  if (b.type === "div" && isNotes(b)) {
    d.current?.notes.push(...b.children);
    return;
  }
  if (b.type === "paragraph" && isSubtitle(d, b)) {
    d.subtitle.push(b.children);
    return;
  }
  (d.current ?? startSlide(d, null)).blocks.push(b);
}

export function splitSlides(blocks: readonly Block[]): Deck {
  const head = blocks[0];
  const hasMeta = head?.type === "meta";
  const metaTitle = metaValue(head, "title");
  const metaSubtitle = metaValue(head, "subtitle");
  const d: DeckBuilder = {
    hasMeta,
    title: metaTitle === undefined ? null : parseInline(metaTitle),
    subtitle: metaSubtitle === undefined ? [] : [parseInline(metaSubtitle)],
    slides: [],
    current: null,
  };
  for (const b of fitBlanks(hasMeta ? blocks.slice(1) : blocks))
    placeBlock(d, b);
  const meta: DeckMeta = {
    author: metaValue(head, "author"),
    institute: metaValue(head, "institute"),
    date: metaValue(head, "date"),
  };
  return { title: d.title, subtitle: d.subtitle, meta, slides: d.slides };
}
