import test from "node:test";
import assert from "node:assert/strict";

import { splitFrontMatter } from "../src/help/frontmatter.ts";
import { comboLabel, keymapHtml } from "../src/help/keymap.ts";
import { renderMarkdown, slug } from "../src/help/render.ts";
import {
  SECTIONS,
  buildPage,
  buildPages,
  pagePath,
  sitemapXml,
  type PageSource,
} from "../src/help/site.ts";
import { renderPage } from "../src/help/layout.ts";
import { readSources } from "../src/help/sources.ts";

const page = (meta: string, body = "# Гарчиг\n"): string =>
  "---\n" + meta + "\n---\n" + body;

test("front matter splits fields from the body", () => {
  const { meta, body } = splitFrontMatter(
    "---\ntitle: Толь: сонгох\norder: 2\n---\n# Толь\n",
  );
  assert.deepEqual(meta, { title: "Толь: сонгох", order: "2" });
  assert.equal(body, "# Толь\n");
});

test("front matter is optional", () => {
  assert.deepEqual(splitFrontMatter("# Толь\n"), {
    meta: {},
    body: "# Толь\n",
  });
});

test("combo labels follow each system's convention", () => {
  assert.equal(comboLabel(["Mod", "Shift", "C"], "pc"), "Ctrl+Shift+C");
  assert.equal(comboLabel(["Mod", "Shift", "C"], "mac"), "⌘⇧C");
  assert.equal(comboLabel(["Ctrl", "\\"], "mac"), "⌃\\");
  assert.equal(comboLabel(["Mod", "Alt", "Backspace"], "mac"), "⌘⌥⌫");
});

test("keymap tables escape their text", () => {
  const html = keymapHtml([
    { title: "A & B", items: [{ keys: [["Mod", "<"]], action: "<x>" }] },
  ]);
  assert.match(html, /<h3>A &amp; B<\/h3>/);
  assert.match(html, /<td>&lt;x&gt;<\/td>/);
  assert.match(html, /<kbd>Ctrl\+&lt;<\/kbd>/);
});

test("slug keeps Cyrillic letters", () => {
  assert.equal(
    slug("Үгийн тайлбар толь ашиглах"),
    "үгийн-тайлбар-толь-ашиглах",
  );
  assert.equal(slug("Word, PowerPoint &amp; PDF"), "word-powerpoint-pdf");
});

test("local links stay in the tab and gain the base", () => {
  const { html } = renderMarkdown(
    "[Толь](/zaavar/toli/) [Гадна](https://zuv.bichig.dev/) [Энд](#a)\n",
    "/hunspell-mn/",
  );
  assert.match(html, /<a href="\/hunspell-mn\/zaavar\/toli\/">Толь<\/a>/);
  assert.match(html, /<a href="#a">Энд<\/a>/);
  assert.match(html, /href="https:\/\/zuv\.bichig\.dev\/"[^>]*target="_blank"/);
});

test("images load lazily from the base", () => {
  const { html } = renderMarkdown(
    '![Зураг](/zaavar/img/a.webp){: width="49%" }\n',
    "/",
  );
  assert.match(
    html,
    /<img loading="lazy" decoding="async" src="\/zaavar\/img\/a\.webp" alt="Зураг" style="width:49%">/,
  );
  assert.doesNotMatch(html, /data-line|data-src/);
});

test("a paragraph holding only a YouTube link becomes a video link", () => {
  const { html } = renderMarkdown(
    "[Заавар](https://www.youtube.com/watch?v=abc)\n\n[GitHub](https://github.com/)\n",
    "/",
  );
  assert.match(html, /<p class="video"><a href="https:\/\/www\.youtube\.com/);
  assert.match(html, /<p><a href="https:\/\/github\.com\/"/);
});

test("headings get unique ids and h2s feed the outline", () => {
  const { html, headings } = renderMarkdown(
    "# Нүүр\n\n## Толь\n\n### Толь\n\n## Файл\n",
    "/",
  );
  assert.match(html, /<h2 id="толь">Толь<\/h2>/);
  assert.match(html, /<h3 id="толь-2">Толь<\/h3>/);
  assert.deepEqual(headings, [
    { id: "толь", text: "Толь" },
    { id: "файл", text: "Файл" },
  ]);
});

test("the keymap marker expands into tables", () => {
  const { html } = renderMarkdown("## Товч\n\n@keymap\n", "/");
  assert.match(html, /<table class="keys">/);
  assert.doesNotMatch(html, /@keymap/);
});

test("a demo fence shows its code and its rendered output", () => {
  const { html } = renderMarkdown(
    '```demo\n::: {width="60%" .grid .center}\n| A | B |\n| --- | --- |\n| 1 | 2 |\n:::\n```',
    "/",
  );
  assert.match(html, /<pre><code>::: \{width=/);
  assert.match(html, /<div class="demo"><p class="demo-label">Гаралт<\/p>/);
  assert.match(html, /<table style="width:60%/);
  assert.match(html, /class="e-/);
  assert.doesNotMatch(html, /@demo|data-line/);
});

test("page paths end in a slash and index maps to the section", () => {
  assert.equal(pagePath("zaavar", "index"), "zaavar/");
  assert.equal(pagePath("zaavar", "toli"), "zaavar/toli/");
});

test("a template page links to the app's slot hash", () => {
  const built = buildPage(
    {
      section: "zagvar",
      name: "urgudul",
      text: page(
        "title: Өргөдөл\ndescription: Тайлбар\ntemplate: letter\nexample: application",
      ),
    },
    "/",
  );
  assert.equal(built.open, "#letter/application");
  const html = renderPage(built, { base: "/", css: "", pages: [built] });
  assert.match(
    html,
    /<a class="button" href="\/#letter\/application">Энэ горимыг ап дээр нээх<\/a>/,
  );
});

test("a single-example template drops the example from the hash", () => {
  const built = buildPage(
    {
      section: "zagvar",
      name: "tailan",
      text: page(
        "title: Тайлан\ndescription: Т\ntemplate: report\nexample: research",
      ),
    },
    "/",
  );
  assert.equal(built.open, "#report");
});

test("unknown templates, examples and missing fields fail the build", () => {
  const build = (meta: string): unknown =>
    buildPage({ section: "zagvar", name: "x", text: page(meta) }, "/");
  assert.throws(
    () => build("title: T\ndescription: D\ntemplate: nope"),
    /nope/,
  );
  assert.throws(
    () => build("title: T\ndescription: D\ntemplate: letter\nexample: nope"),
    /letter\/nope/,
  );
  assert.throws(() => build("description: D"), /title/);
  assert.throws(
    () =>
      buildPage(
        { section: "nope", name: "x", text: page("title: T\ndescription: D") },
        "/",
      ),
    /nope/,
  );
});

const sources: PageSource[] = [
  {
    section: "zaavar",
    name: "toli",
    text: page("title: Толь\norder: 1\ndescription: Т"),
  },
  {
    section: "zaavar",
    name: "index",
    text: page("title: Заавар\nnav: Ерөнхий\ndescription: З"),
  },
  {
    section: "zaavar",
    name: "file",
    text: page("title: Файл\norder: 2\ndescription: Ф"),
  },
  {
    section: "zagvar",
    name: "index",
    text: page("title: Загвар\ndescription: Г"),
  },
];

test("pages sort by section, then order", () => {
  const pages = buildPages(sources, "/");
  assert.deepEqual(
    pages.map((item) => item.path),
    ["zaavar/", "zaavar/toli/", "zaavar/file/", "zagvar/"],
  );
});

test("the sitemap lists the app and every page", () => {
  const xml = sitemapXml(buildPages(sources, "/"));
  assert.match(xml, /<loc>https:\/\/aldaa\.bichig\.dev\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/aldaa\.bichig\.dev\/zaavar\/toli\/<\/loc>/);
  assert.equal(xml.match(/<url>/g)?.length, 5);
});

test("a rendered page carries canonical, navigation and breadcrumbs", () => {
  const pages = buildPages(sources, "/b/");
  const toli = pages.find((item) => item.path === "zaavar/toli/")!;
  const html = renderPage(toli, {
    base: "/b/",
    css: 'a{src:url("/x")}',
    pages,
  });
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/aldaa\.bichig\.dev\/zaavar\/toli\/">/,
  );
  assert.match(html, /<title>Толь — Монгол үгийн алдаа шалгагч<\/title>/);
  assert.match(
    html,
    /<a href="\/b\/zaavar\/toli\/" aria-current="page">Толь<\/a>/,
  );
  assert.match(
    html,
    /<a rel="prev" href="\/b\/zaavar\/"><small>Өмнөх<\/small>Ерөнхий<\/a>/,
  );
  assert.match(html, /<a rel="next" href="\/b\/zaavar\/file\/">/);
  assert.match(html, /url\("\/b\/x"\)/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(
    html,
    /<a class="brand" href="\/b\/">Монгол үгийн алдаа шалгагч<\/a>/,
  );
  assert.match(html, /<button id="theme" class="theme" type="button"/);
  assert.match(html, /localStorage\.setItem\('theme',n\)/);
  assert.match(
    html,
    /"name":"Ерөнхий","item":"https:\/\/aldaa\.bichig\.dev\/zaavar\/"/,
  );
});

test("long pages get an outline after the title", () => {
  const long = buildPage(
    {
      section: "zaavar",
      name: "index",
      text: page("title: З\ndescription: Д", "# З\n\n## А\n\n## Б\n\n## В\n"),
    },
    "/",
  );
  const html = renderPage(long, { base: "/", css: "", pages: [long] });
  assert.match(
    html,
    /<\/h1><nav class="toc"[^>]*><p>Гарчиг<\/p><ol><li><a href="#а">А<\/a>/,
  );
});

test("every help page in the repo builds", () => {
  const pages = buildPages(readSources("help"), "/");
  for (const section of SECTIONS)
    assert.ok(
      pages.some((item) => item.path === section.id + "/"),
      section.id,
    );
  for (const item of pages) {
    assert.match(item.content.html, /<h1/, item.path);
    assert.doesNotMatch(item.content.html, /&lt;iframe/, item.path);
  }
});
