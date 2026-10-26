import { compareMongolian } from "./mncollate.ts";

export type RangeMark = "open" | "close" | null;

export interface PageRef {
  readonly page: string;
  readonly encap: string;
  readonly range: RangeMark;
}

const PAGE_KIND = { roman: 0, arabic: 1, other: 2 };

interface PageValue {
  readonly kind: number;
  readonly value: number;
}

const IMPLICIT_RANGE = 3;
const RANGE = "--";

const ROMAN: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

function romanValue(page: string): number | null {
  const digits = [...page.toLowerCase()].map((char) => ROMAN[char]);
  if (!digits.length || digits.some((value) => value === undefined))
    return null;
  let total = 0;
  digits.forEach((value, at) => {
    const next = digits[at + 1] ?? 0;
    total += value! < next ? -value! : value!;
  });
  return total;
}

function pageValue(page: string): PageValue {
  if (/^\d+$/.test(page))
    return { kind: PAGE_KIND.arabic, value: Number(page) };
  const roman = romanValue(page);
  return roman === null
    ? { kind: PAGE_KIND.other, value: 0 }
    : { kind: PAGE_KIND.roman, value: roman };
}

function comparePages(a: PageRef, b: PageRef): number {
  const [x, y] = [pageValue(a.page), pageValue(b.page)];
  return (
    x.kind - y.kind || x.value - y.value || compareMongolian(a.page, b.page)
  );
}

function successive(a: PageRef, b: PageRef): boolean {
  const [x, y] = [pageValue(a.page), pageValue(b.page)];
  return (
    x.kind === y.kind && x.kind !== PAGE_KIND.other && y.value === x.value + 1
  );
}

function wrap(encap: string, page: string): string {
  return encap ? "\\" + encap + "{" + page + "}" : page;
}

function span(first: string, last: string): string {
  return first === last ? first : first + RANGE + last;
}

type Run =
  | { readonly kind: "span"; readonly text: string }
  | { readonly kind: "page"; readonly ref: PageRef };

function explicitRanges(refs: readonly PageRef[]): Run[] {
  const runs: Run[] = [];
  let open: PageRef | null = null;
  for (const ref of refs) {
    if (ref.range === "open") open ??= ref;
    else if (ref.range === "close" && open) {
      runs.push({
        kind: "span",
        text: wrap(open.encap, span(open.page, ref.page)),
      });
      open = null;
    } else if (!open) runs.push({ kind: "page", ref });
  }
  if (open) runs.push({ kind: "span", text: wrap(open.encap, open.page) });
  return runs;
}

function runEnd(pages: readonly PageRef[], start: number): number {
  let end = start;
  while (
    end + 1 < pages.length &&
    pages[end + 1]!.encap === pages[start]!.encap &&
    successive(pages[end]!, pages[end + 1]!)
  )
    end += 1;
  return end;
}

function implicitRanges(pages: readonly PageRef[]): string[] {
  const out: string[] = [];
  for (let at = 0; at < pages.length;) {
    const end = runEnd(pages, at);
    const first = pages[at]!;
    if (end - at + 1 >= IMPLICIT_RANGE)
      out.push(wrap(first.encap, span(first.page, pages[end]!.page)));
    else
      for (const ref of pages.slice(at, end + 1))
        out.push(wrap(ref.encap, ref.page));
    at = end + 1;
  }
  return out;
}

function distinct(refs: readonly PageRef[]): PageRef[] {
  const byKey = new Map<string, PageRef>();
  for (const ref of refs) {
    const key = JSON.stringify([ref.page, ref.encap, ref.range]);
    if (!byKey.has(key)) byKey.set(key, ref);
  }
  return [...byKey.values()];
}

export function pageList(refs: readonly PageRef[]): string[] {
  const out: string[] = [];
  let plain: PageRef[] = [];
  const flush = (): void => {
    out.push(...implicitRanges(plain));
    plain = [];
  };
  for (const run of explicitRanges(distinct([...refs].sort(comparePages)))) {
    if (run.kind === "page") plain.push(run.ref);
    else {
      flush();
      out.push(run.text);
    }
  }
  flush();
  return out;
}
