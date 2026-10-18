import { LOGO_HTML, dashes, withLogos } from "./texlogo.ts";
import {
  type Block,
  type Inline,
  type ListTree,
  isFigure,
  listTree,
} from "./ast.ts";
import { blankEm, isBlankRow } from "./blanks.ts";

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

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function inlineHtml(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text")
      out += withLogos(
        dashes(n.value),
        (name) => `<span class="tex-logo">${LOGO_HTML[name]}</span>`,
        esc,
      );
    else if (n.type === "code") out += `<code>${esc(n.value)}</code>`;
    else if (n.type === "math")
      out +=
        `<span class="math${n.open === "$$" ? " math-display" : ""}">` +
        `${esc(n.value)}</span>`;
    else if (n.type === "blank")
      out += n.fill
        ? `<span class="blank fill"></span>`
        : `<span class="blank" style="--blank:${blankEm(n) * 2}"></span>`;
    else if (n.type === "softbreak") out += "\n";
    else if (n.type === "break") out += "<br>";
    else if (n.type === "strong")
      out += `<strong>${inlineHtml(n.children)}</strong>`;
    else if (n.type === "em") out += `<em>${inlineHtml(n.children)}</em>`;
    else if (n.type === "del") out += `<del>${inlineHtml(n.children)}</del>`;
    else if (n.type === "image")
      out +=
        `<img class="md-image" data-src="${esc(n.src)}" alt="${esc(n.alt)}"` +
        (n.width === undefined ? "" : ` style="width:${n.width}%"`) +
        (n.rotate === undefined ? "" : ` data-rotate="${n.rotate}"`) +
        `>`;
    else if (!safeHref(n.url)) out += inlineHtml(n.children);
    else
      out +=
        `<a href="${esc(n.url)}" rel="noopener noreferrer" target="_blank">` +
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

export function toHtml(blocks: readonly Block[]): string {
  let out = "";
  for (const b of blocks) {
    const at = ` data-line="${b.line}"`;
    if (b.type === "heading")
      out += `<h${b.depth}${at}>${inlineHtml(b.children)}</h${b.depth}>`;
    else if (b.type === "paragraph")
      out += `<p${isFigure(b.children) ? ' class="md-figure"' : ""}${at}>${inlineHtml(b.children)}</p>`;
    else if (b.type === "rule") out += `<hr${at}>`;
    else if (b.type === "pagebreak") out += `<hr class="page-break"${at}>`;
    else if (b.type === "codeblock")
      out += `<pre${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "math")
      out += `<div class="math math-display"${at}>${esc(b.value)}</div>`;
    else if (b.type === "latex")
      out += `<pre class="latex"${at}><code>${esc(b.value)}</code></pre>`;
    else if (b.type === "meta")
      out +=
        `<div class="md-meta"${at}>` +
        b.fields
          .map(
            (field) =>
              `<p class="md-meta-${esc(field.key)}">${esc(field.value)}</p>`,
          )
          .join("") +
        `</div>`;
    else if (b.type === "div") {
      const width = /^\d+(?:\.\d+)?%$/.test(b.keys["width"] ?? "")
        ? ` style="flex-basis:${b.keys["width"]}"`
        : "";
      const kind = b.classes.includes("notes")
        ? "md-notes"
        : b.classes.includes("columns")
          ? "md-columns"
          : b.classes.includes("column")
            ? "md-column"
            : "md-div";
      const align = ["right", "center", "left", "signature"]
        .filter((name) => b.classes.includes(name))
        .map((name) => " md-" + name)
        .join("");
      out += `<div class="${kind}${align}"${width}${at}>${toHtml(b.children)}</div>`;
    } else if (b.type === "quote")
      out += `<blockquote${at}>${toHtml(b.children)}</blockquote>`;
    else if (b.type === "list") out += listHtml(listTree(b), at);
    else {
      const [header, ...body] = b.rows;
      const style = (i: number): string =>
        b.align[i] ? ` style="text-align:${b.align[i]}"` : "";
      out +=
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
        `</tbody></table>`;
    }
  }
  return out;
}
