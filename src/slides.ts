import type { Block, Inline } from "./markdown.ts";

export interface Slide {
  readonly title: Inline[] | null;
  readonly blocks: Block[];
}

export interface Deck {
  readonly title: Inline[] | null;
  readonly subtitle: Inline[][];
  readonly slides: Slide[];
}

export function splitSlides(blocks: readonly Block[]): Deck {
  let title: Inline[] | null = null;
  const subtitle: Inline[][] = [];
  const slides: Slide[] = [];
  let current: Slide | null = null;

  for (const b of blocks) {
    if (b.type === "heading" && b.depth === 1 && title === null && !slides.length) {
      title = b.children;
      continue;
    }
    if (b.type === "heading" && b.depth <= 2) {
      current = { title: b.children, blocks: [] };
      slides.push(current);
      continue;
    }
    if (b.type === "rule") {
      current = { title: null, blocks: [] };
      slides.push(current);
      continue;
    }
    if (current === null) {
      if (title !== null && b.type === "paragraph") {
        subtitle.push(b.children);
        continue;
      }
      current = { title: null, blocks: [] };
      slides.push(current);
    }
    current.blocks.push(b);
  }

  return { title, subtitle, slides };
}
