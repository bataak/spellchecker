import { escapeAttr, escapeHtml } from "../core/htmlutil.ts";
import { SECTIONS, SITE, type Page } from "./site.ts";

export interface LayoutContext {
  readonly base: string;
  readonly css: string;
  readonly pages: readonly Page[];
}

const APP_NAME = "Монгол үгийн алдаа шалгагч";
const TOC_MIN = 3;

const THEME_SCRIPT =
  "try{var t=localStorage.getItem('theme');" +
  "if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}";

const TOGGLE_SCRIPT =
  "document.getElementById('theme').addEventListener('click',function(){" +
  "var r=document.documentElement,c=r.getAttribute('data-theme')||" +
  "(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')," +
  "n=c==='dark'?'light':'dark';r.setAttribute('data-theme',n);" +
  "try{localStorage.setItem('theme',n)}catch(e){}})";

const ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">';

const THEME_BUTTON =
  '<button id="theme" class="theme" type="button" ' +
  'title="Гэрэлтэй / бараан" aria-label="Гэрэлтэй / бараан">' +
  ICON +
  '<path class="moon" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' +
  '<g class="sun"><circle cx="12" cy="12" r="4"/>' +
  '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4' +
  'M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg></button>';

const link = (href: string, text: string, current = false): string =>
  '<a href="' +
  escapeAttr(href) +
  '"' +
  (current ? ' aria-current="page"' : "") +
  ">" +
  escapeHtml(text) +
  "</a>";

const sectionHome = (pages: readonly Page[], id: string): Page | undefined =>
  pages.find((page) => page.section.id === id && page.order === 0);

function breadcrumbJson(page: Page, ctx: LayoutContext): string {
  const home = sectionHome(ctx.pages, page.section.id);
  const trail = [
    { name: APP_NAME, url: SITE },
    ...(home && home !== page
      ? [{ name: home.nav, url: SITE + home.path }]
      : []),
    { name: page.nav, url: SITE + page.path },
  ];
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }).replace(/</g, "\\u003c");
}

function head(page: Page, ctx: LayoutContext): string {
  const url = SITE + page.path;
  const title = escapeAttr(page.title + " — " + APP_NAME);
  const description = escapeAttr(page.description);
  const icon = (size: string): string =>
    '<link rel="icon" type="image/png" sizes="' +
    size +
    '" href="' +
    ctx.base +
    "favicon-" +
    size +
    '.png">';
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + title + "</title>",
    '<meta name="description" content="' + description + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="bichig.dev">',
    '<meta property="og:locale" content="mn_MN">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:title" content="' + escapeAttr(page.title) + '">',
    '<meta property="og:description" content="' + description + '">',
    '<meta property="og:image" content="' + SITE + 'og.png">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#17150f">',
    icon("32x32"),
    icon("16x16"),
    '<link rel="apple-touch-icon" href="' + ctx.base + 'apple-touch-icon.png">',
    "<script>" + THEME_SCRIPT + "</script>",
    "<style>" + ctx.css.replace(/url\("\//g, 'url("' + ctx.base) + "</style>",
    '<script type="application/ld+json">' +
      breadcrumbJson(page, ctx) +
      "</script>",
  ].join("\n");
}

function topBar(page: Page, ctx: LayoutContext): string {
  const sections = SECTIONS.map((section) => {
    const home = sectionHome(ctx.pages, section.id);
    return home
      ? link(ctx.base + home.path, section.name, section === page.section)
      : "";
  }).join("");
  return (
    '<header class="top"><a class="brand" href="' +
    ctx.base +
    '">' +
    APP_NAME +
    '</a><nav class="sections" aria-label="Хэсгүүд">' +
    sections +
    "</nav>" +
    THEME_BUTTON +
    '<a class="cta" href="' +
    ctx.base +
    '">Ап нээх</a></header>'
  );
}

function sideNav(page: Page, ctx: LayoutContext): string {
  const items = ctx.pages
    .filter((item) => item.section === page.section)
    .map(
      (item) =>
        "<li>" + link(ctx.base + item.path, item.nav, item === page) + "</li>",
    )
    .join("");
  return (
    '<nav class="side" aria-label="' +
    escapeAttr(page.section.name) +
    '"><ul>' +
    items +
    "</ul></nav>"
  );
}

function toc(page: Page): string {
  const { headings } = page.content;
  if (headings.length < TOC_MIN) return "";
  const items = headings
    .map((h) => "<li>" + link("#" + h.id, h.text) + "</li>")
    .join("");
  return (
    '<nav class="toc" aria-label="Гарчиг"><p>Гарчиг</p><ol>' +
    items +
    "</ol></nav>"
  );
}

function openButton(page: Page, ctx: LayoutContext): string {
  if (!page.open) return "";
  return (
    '<p class="open"><a class="button" href="' +
    escapeAttr(ctx.base + page.open) +
    '">Энэ горимыг ап дээр нээх</a></p>'
  );
}

function article(page: Page, ctx: LayoutContext): string {
  const lead = openButton(page, ctx) + toc(page);
  const html = page.content.html;
  const cut = html.indexOf("</h1>");
  return cut < 0
    ? lead + html
    : html.slice(0, cut + 5) + lead + html.slice(cut + 5);
}

function pager(page: Page, ctx: LayoutContext): string {
  const siblings = ctx.pages.filter((item) => item.section === page.section);
  const index = siblings.indexOf(page);
  const side = (item: Page | undefined, rel: string, label: string): string =>
    item
      ? '<a rel="' +
        rel +
        '" href="' +
        escapeAttr(ctx.base + item.path) +
        '"><small>' +
        label +
        "</small>" +
        escapeHtml(item.nav) +
        "</a>"
      : "<span></span>";
  return (
    '<nav class="pager" aria-label="Хуудас">' +
    side(siblings[index - 1], "prev", "Өмнөх") +
    side(siblings[index + 1], "next", "Дараах") +
    "</nav>"
  );
}

const FOOTER =
  '<footer class="foot"><p>' +
  '<a href="https://zuv.bichig.dev/">zuv.bichig.dev</a> · ' +
  '<a href="https://zuv.bichig.dev/book/">Монгол үсгийн дүрмийн толь</a> · ' +
  '<a href="https://github.com/bataak/spellchecker">GitHub</a>' +
  "</p></footer>";

export function renderPage(page: Page, ctx: LayoutContext): string {
  return (
    '<!doctype html>\n<html lang="mn">\n<head>\n' +
    head(page, ctx) +
    "\n</head>\n<body>\n" +
    topBar(page, ctx) +
    '<div class="wrap">' +
    sideNav(page, ctx) +
    "<main><article>" +
    article(page, ctx) +
    "</article>" +
    pager(page, ctx) +
    "</main></div>" +
    FOOTER +
    "<script>" +
    TOGGLE_SCRIPT +
    "</script>" +
    "\n</body>\n</html>\n"
  );
}
