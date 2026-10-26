import { LOGO_HTML, dashes, withLogos } from "./texlogo.ts";
import {
  type Block,
  type Inline,
  type ListTree,
  isFigure,
  listTree,
} from "./ast.ts";
import { blankEm, isBlankRow } from "./blanks.ts";
import { escapeAttr } from "../core/htmlutil.ts";

const URL_SCHEME = /^([a-z][a-z\d+.-]*):/i;
const SAFE_SCHEMES: ReadonlySet<string> = new Set([
  "http",
  "https",
  "mailto",
  "tel",
]);

export function safeHref(url: string): boolean {
  const bare = url.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const scheme = URL_SCHEME.exec(bare);
  return !scheme || SAFE_SCHEMES.has(scheme[1]!.toLowerCase());
}

function inlineHtml(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text")
      out += withLogos(
        dashes(n.value),
        (name) => `<span class="tex-logo">${LOGO_HTML[name]}</span>`,
        escapeAttr,
      );
    else if (n.type === "code") out += `<code>${escapeAttr(n.value)}</code>`;
    else if (n.type === "math")
      out +=
        `<span class="math${n.open === "$$" ? " math-display" : ""}">` +
        `${escapeAttr(n.value)}</span>`;
    else if (n.type === "blank")
      out += n.fill
        ? `<span class="blank fill"></span>`
        : `<span class="blank" data-style="--blank:${blankEm(n) * 2}"></span>`;
    else if (n.type === "softbreak") out += "\n";
    else if (n.type === "break") out += "<br>";
    else if (n.type === "strong")
      out += `<strong>${inlineHtml(n.children)}</strong>`;
    else if (n.type === "em") out += `<em>${inlineHtml(n.children)}</em>`;
    else if (n.type === "del") out += `<del>${inlineHtml(n.children)}</del>`;
    else if (n.type === "image")
      out +=
        `<img class="md-image" data-src="${escapeAttr(n.src)}" alt="${escapeAttr(n.alt)}"` +
        (n.width === undefined ? "" : ` data-style="width:${n.width}%"`) +
        (n.rotate === undefined ? "" : ` data-rotate="${n.rotate}"`) +
        `>`;
    else if (!safeHref(n.url)) out += inlineHtml(n.children);
    else
      out +=
        `<a href="${escapeAttr(n.url)}" rel="noopener noreferrer" target="_blank">` +
        `${inlineHtml(n.children)}</a>`;
  }
  return out;
}

function listHtml(tree: ListTree, at = ""): string {
  const tag = tree.ordered ? "ol" : "ul";
  const startAttr =
    tree.ordered && tree.start !== 1 ? ` start="${tree.start}"` : "";
  return (
    `<${tag}${startAttr}${at}>` +
    tree.entries
      .map(
        ({ item, sub }) =>
          `<li>${inlineHtml(item)}${sub ? listHtml(sub) : ""}</li>`,
      )
      .join("") +
    `</${tag}>`
  );
}

type BlockOf<T extends Block["type"]> = Extract<Block, { type: T }>;

function metaHtml(b: BlockOf<"meta">, at: string): string {
  return (
    `<div class="md-meta"${at}>` +
    b.fields
      .map(
        (field) =>
          `<p class="md-meta-${escapeAttr(field.key)}">${escapeAttr(field.value)}</p>`,
      )
      .join("") +
    `</div>`
  );
}

function divKind(classes: readonly string[]): string {
  if (classes.includes("notes")) return "md-notes";
  if (classes.includes("columns")) return "md-columns";
  if (classes.includes("column")) return "md-column";
  return "md-div";
}

function divHtml(b: BlockOf<"div">, at: string): string {
  const width = /^\d+(?:\.\d+)?%$/.test(b.keys["width"] ?? "")
    ? ` data-style="flex-basis:${b.keys["width"]}"`
    : "";
  const align = ["right", "center", "left", "signature"]
    .filter((name) => b.classes.includes(name))
    .map((name) => " md-" + name)
    .join("");
  return `<div class="${divKind(b.classes)}${align}"${width}${at}>${toHtml(b.children)}</div>`;
}

function tableHtml(b: BlockOf<"table">, at: string): string {
  const [header, ...body] = b.rows;
  const style = (i: number): string =>
    b.align[i] ? ` data-style="text-align:${b.align[i]}"` : "";
  return (
    `<table${at}>` +
    (isBlankRow(header)
      ? ""
      : `<thead><tr>` +
        (header ?? [])
          .map((c, i) => `<th${style(i)}>${inlineHtml(c)}</th>`)
          .join("") +
        `</tr></thead>`) +
    `<tbody>` +
    body
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td${style(i)}>${inlineHtml(c)}</td>`).join("")}</tr>`,
      )
      .join("") +
    `</tbody></table>`
  );
}

function blockHtml(b: Block): string {
  const at = ` data-line="${b.line}"`;
  switch (b.type) {
    case "heading":
      return `<h${b.depth}${at}>${inlineHtml(b.children)}</h${b.depth}>`;
    case "paragraph":
      return `<p${isFigure(b.children) ? ' class="md-figure"' : ""}${at}>${inlineHtml(b.children)}</p>`;
    case "rule":
      return `<hr${at}>`;
    case "pagebreak":
      return `<hr class="page-break"${at}>`;
    case "codeblock":
      return `<pre${at}><code>${escapeAttr(b.value)}</code></pre>`;
    case "math":
      return `<div class="math math-display"${at}>${escapeAttr(b.value)}</div>`;
    case "latex":
      return `<pre class="latex"${at}><code>${escapeAttr(b.value)}</code></pre>`;
    case "meta":
      return metaHtml(b, at);
    case "div":
      return divHtml(b, at);
    case "quote":
      return `<blockquote${at}>${toHtml(b.children)}</blockquote>`;
    case "list":
      return listHtml(listTree(b), at);
    default:
      return tableHtml(b, at);
  }
}

export function toHtml(blocks: readonly Block[]): string {
  return blocks.map(blockHtml).join("");
}
