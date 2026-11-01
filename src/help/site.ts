import { slotHash } from "../app/slothash.ts";
import { findTemplate } from "../doc/templates.ts";
import { splitFrontMatter } from "./frontmatter.ts";
import { renderMarkdown, type Rendered } from "./render.ts";

export const SITE = "https://aldaa.bichig.dev/";

export interface Section {
  readonly id: string;
  readonly name: string;
}

export const SECTIONS: readonly Section[] = [
  { id: "zaavar", name: "Заавар" },
  { id: "zagvar", name: "Загвар" },
];

export interface PageSource {
  readonly section: string;
  readonly name: string;
  readonly text: string;
}

export interface Page {
  readonly section: Section;
  readonly path: string;
  readonly title: string;
  readonly nav: string;
  readonly description: string;
  readonly order: number;
  readonly open: string | null;
  readonly content: Rendered;
}

const INDEX = "index";

export const pagePath = (section: string, name: string): string =>
  section + "/" + (name === INDEX ? "" : name + "/");

function required(
  meta: Readonly<Record<string, string>>,
  key: string,
  where: string,
): string {
  const value = meta[key];
  if (!value) throw new Error(where + ": «" + key + "» талбар дутуу");
  return value;
}

function openHash(
  meta: Readonly<Record<string, string>>,
  where: string,
): string | null {
  const id = meta["template"];
  if (!id) return null;
  const template = findTemplate(id);
  const example = meta["example"];
  if (!template) throw new Error(where + ": «" + id + "» загвар алга");
  if (example && !template.examples?.some((item) => item.id === example))
    throw new Error(where + ": «" + id + "/" + example + "» жишээ алга");
  return slotHash({ kind: "template", id, example });
}

function sectionOf(id: string, where: string): Section {
  const section = SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(where + ": «" + id + "» хэсэг алга");
  return section;
}

export function buildPage(source: PageSource, base: string): Page {
  const path = pagePath(source.section, source.name);
  const { meta, body } = splitFrontMatter(source.text);
  const title = required(meta, "title", path);
  return {
    section: sectionOf(source.section, path),
    path,
    title,
    nav: meta["nav"] || title,
    description: required(meta, "description", path),
    order: source.name === INDEX ? 0 : Number(meta["order"] ?? 99),
    open: openHash(meta, path),
    content: renderMarkdown(body, base),
  };
}

export function buildPages(
  sources: readonly PageSource[],
  base: string,
): Page[] {
  const sectionRank = (page: Page): number => SECTIONS.indexOf(page.section);
  return sources
    .map((source) => buildPage(source, base))
    .sort(
      (a, b) =>
        sectionRank(a) - sectionRank(b) ||
        a.order - b.order ||
        a.path.localeCompare(b.path),
    );
}

export function sitemapXml(pages: readonly Page[]): string {
  const urls = ["", ...pages.map((page) => page.path)]
    .map((path) => "  <url>\n    <loc>" + SITE + path + "</loc>\n  </url>\n")
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    "</urlset>\n"
  );
}
