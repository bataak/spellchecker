import { parse, toHtml } from "../markdown.ts";
import { keymapHtml } from "./keymap.ts";

export interface Heading {
  readonly id: string;
  readonly text: string;
}

export interface Rendered {
  readonly html: string;
  readonly headings: readonly Heading[];
}

const KEYMAP_MARK = "<p>@keymap</p>";
const VIDEO = /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)/;

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, "");

const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export function slug(text: string): string {
  return decodeEntities(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function localUrls(html: string, base: string): string {
  return html
    .replace(
      /<a href="([/#][^"]*)" rel="noopener noreferrer" target="_blank">/g,
      (_, href: string) => '<a href="' + href + '">',
    )
    .replace(/(href|src)="\/(?!\/)/g, (_, attr: string) => attr + '="' + base);
}

function images(html: string): string {
  return html
    .replace(
      /<img class="md-image" data-src="/g,
      '<img loading="lazy" decoding="async" src="',
    )
    .replace(/ data-style="/g, ' style="');
}

function videos(html: string): string {
  return html.replace(
    /<p><a href="([^"]+)"([^>]*)>([^<]+)<\/a><\/p>/g,
    (whole, href: string, rest: string, text: string) =>
      VIDEO.test(href)
        ? '<p class="video"><a href="' +
          href +
          '"' +
          rest +
          ">" +
          text +
          "</a></p>"
        : whole,
  );
}

function headingIds(html: string): Rendered {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const out = html.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_, level: string, inner: string) => {
      const text = decodeEntities(stripTags(inner));
      const root = slug(text) || "heading";
      const count = used.get(root) ?? 0;
      used.set(root, count + 1);
      const id = count ? root + "-" + String(count + 1) : root;
      if (level === "2") headings.push({ id, text });
      return "<h" + level + ' id="' + id + '">' + inner + "</h" + level + ">";
    },
  );
  return { html: out, headings };
}

export function renderMarkdown(source: string, base: string): Rendered {
  const raw = toHtml(parse(source))
    .replace(/ data-line="\d+"/g, "")
    .replace(/ class="e-[^"]*"/g, "")
    .replace(/<table>/g, '<div class="table"><table>')
    .replace(/<\/table>/g, "</table></div>")
    .replace(KEYMAP_MARK, keymapHtml());
  return headingIds(videos(images(localUrls(raw, base))));
}
