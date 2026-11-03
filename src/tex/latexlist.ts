import type { Inline, ListTree } from "../markdown.ts";

type InlineRenderer = (nodes: readonly Inline[]) => string;

const ENUM_COUNTERS = ["enumi", "enumii", "enumiii", "enumiv"];

interface ListLimit {
  readonly perType: number;
  readonly total: number;
}

const MAX_NESTED_ENVS = 6;
const ARTICLE_LIMIT: ListLimit = { perType: 4, total: MAX_NESTED_ENVS };
const BEAMER_LIMIT: ListLimit = { perType: 3, total: 3 };

export const MAX_NESTED_QUOTES = MAX_NESTED_ENVS - 1;

interface ListNest {
  readonly depth: number;
  readonly bullets: number;
  readonly enums: number;
  readonly perType: number;
  readonly total: number;
}

type ListEntry = ListTree["entries"][number];

function listFits(tree: ListTree, nest: ListNest): boolean {
  const used = tree.ordered ? nest.enums : nest.bullets;
  return used < nest.perType && nest.depth < nest.total;
}

function flatEntries(tree: ListTree): ListEntry[] {
  return tree.entries.flatMap(({ item, sub }) => [
    { item, sub: null },
    ...(sub ? flatEntries(sub) : []),
  ]);
}

function fittingEntries(tree: ListTree, inner: ListNest): ListEntry[] {
  return tree.entries.flatMap((entry) =>
    !entry.sub || listFits(entry.sub, inner)
      ? [entry]
      : [{ item: entry.item, sub: null }, ...flatEntries(entry.sub)],
  );
}

function nestedList(
  tree: ListTree,
  nest: ListNest,
  inline: InlineRenderer,
): string {
  const env = tree.ordered ? "enumerate" : "itemize";
  const pad = "  ".repeat(nest.depth);
  const counter = ENUM_COUNTERS[nest.enums];
  const start =
    tree.ordered && tree.start !== 1 && counter
      ? pad + "\\setcounter{" + counter + "}{" + String(tree.start - 1) + "}\n"
      : "";
  const inner: ListNest = {
    ...nest,
    depth: nest.depth + 1,
    bullets: nest.bullets + (tree.ordered ? 0 : 1),
    enums: nest.enums + (tree.ordered ? 1 : 0),
  };
  const items = fittingEntries(tree, inner).map(({ item, sub }) => {
    const text = inline(item);
    const guard = text.startsWith("[") ? "{}" : "";
    return (
      pad +
      "  \\item " +
      guard +
      text +
      (sub ? "\n" + nestedList(sub, inner, inline) : "")
    );
  });
  return (
    pad +
    "\\begin{" +
    env +
    "}\n" +
    start +
    items.join("\n") +
    "\n" +
    pad +
    "\\end{" +
    env +
    "}"
  );
}

export function listLatex(
  tree: ListTree,
  inline: InlineRenderer,
  beamer: boolean,
  outerEnvs: number,
): string {
  const limit = beamer ? BEAMER_LIMIT : ARTICLE_LIMIT;
  return nestedList(
    tree,
    {
      depth: 0,
      bullets: 0,
      enums: 0,
      perType: limit.perType,
      total: Math.min(limit.total, MAX_NESTED_ENVS - outerEnvs),
    },
    inline,
  );
}
