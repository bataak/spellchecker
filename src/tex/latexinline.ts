import {
  type Inline,
  withLogos,
  mathSource,
  textLogos,
  blankEm,
  safeHref,
} from "../markdown.ts";
import { guardBreak, escapeProse, escapeCode } from "./texescape.ts";
import { attempt } from "../core/attempt.ts";

function escapeUrl(url: string): string {
  return url.replace(/[\\{}%#]/g, (c) => "\\" + c);
}

export function oneLine(nodes: readonly Inline[]): string {
  return inline(
    nodes.map((n): Inline =>
      n.type === "break" ? { type: "text", value: " " } : n,
    ),
  );
}

export function texImagePath(src: string): string {
  return attempt(() => decodeURIComponent(src), src).replace(/[{}%#\\]/g, "_");
}

const LINE_BREAK = "\\\\\n";

function inlineNode(n: Inline): string {
  switch (n.type) {
    case "text":
      return withLogos(n.value, (name) => "\\" + name + "{}", escapeProse);
    case "code":
      return "\\texttt{" + escapeCode(n.value) + "}";
    case "strong":
      return "\\textbf{" + inline(n.children) + "}";
    case "em":
      return "\\emph{" + inline(n.children) + "}";
    case "math":
      return mathSource(n.open, textLogos(n.value));
    case "softbreak":
      return "\n";
    case "break":
      return LINE_BREAK;
    case "blank":
      return (
        "\\rule[-0.3ex]{" +
        String(
          n.fit === undefined
            ? n.width / 2
            : Math.round(blankEm(n) * 100) / 100,
        ) +
        "em}{0.4pt}"
      );
    case "del":
      return inline(n.children);
    case "image":
      return (
        "\\includegraphics[" +
        (n.rotate ? "angle=" + String(n.rotate) + "," : "") +
        "width=" +
        (n.width === undefined ? "" : String(n.width / 100)) +
        "\\linewidth,height=0.85\\textheight,keepaspectratio]{" +
        texImagePath(n.src) +
        "}"
      );
    default:
      if (!safeHref(n.url)) return inline(n.children);
      if (n.auto) return "\\url{" + escapeUrl(n.url) + "}";
      return "\\href{" + escapeUrl(n.url) + "}{" + inline(n.children) + "}";
  }
}

export function inline(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    const text = inlineNode(n);
    out += out.endsWith(LINE_BREAK) ? guardBreak(text) : text;
  }
  return out;
}
