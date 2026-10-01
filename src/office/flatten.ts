import {
  LOGO_TEXT,
  blankUnderscores,
  mathSource,
  withLogos,
  type Inline,
} from "../markdown.ts";
import type { IrRun } from "./docir.ts";

interface Marks {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly mono?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
}

function sameMarks(a: Marks, b: Marks): boolean {
  return (
    (a.bold ?? false) === (b.bold ?? false) &&
    (a.italic ?? false) === (b.italic ?? false) &&
    (a.mono ?? false) === (b.mono ?? false) &&
    (a.strike ?? false) === (b.strike ?? false) &&
    (a.href ?? "") === (b.href ?? "")
  );
}

function withMarks(text: string, marks: Marks): IrRun {
  const run: {
    text: string;
    bold?: boolean;
    italic?: boolean;
    mono?: boolean;
    strike?: boolean;
    href?: string;
  } = { text };
  if (marks.bold) run.bold = true;
  if (marks.italic) run.italic = true;
  if (marks.mono) run.mono = true;
  if (marks.strike) run.strike = true;
  if (marks.href) run.href = marks.href;
  return run;
}

function push(out: IrRun[], text: string, marks: Marks): void {
  const last = out.at(-1);
  if (last?.fill) {
    text = text.trimStart();
    if (text) out.push(withMarks("\n" + text, marks));
    return;
  }
  if (!text) return;
  if (last && !last.image && sameMarks(last, marks)) {
    out[out.length - 1] = { ...last, text: last.text + text };
    return;
  }
  out.push(withMarks(text, marks));
}

function walk(nodes: readonly Inline[], marks: Marks, out: IrRun[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        push(
          out,
          withLogos(
            node.value,
            (name) => LOGO_TEXT[name],
            (part) => part,
          ),
          marks,
        );
        break;
      case "code":
        push(out, node.value, { ...marks, mono: true });
        break;
      case "math":
        push(out, mathSource(node.open, node.value), marks);
        break;
      case "blank":
        if (node.fill) out.push({ text: "", fill: true });
        else push(out, "_".repeat(blankUnderscores(node)), marks);
        break;
      case "image":
        out.push({
          text: "",
          image: {
            src: node.src,
            ...(node.width === undefined ? {} : { widthPercent: node.width }),
            ...(node.rotate === undefined ? {} : { rotate: node.rotate }),
          },
        });
        break;
      case "softbreak":
        push(out, " ", marks);
        break;
      case "break":
        push(out, "\n", marks);
        break;
      case "strong":
        walk(node.children, { ...marks, bold: true }, out);
        break;
      case "em":
        walk(node.children, { ...marks, italic: true }, out);
        break;
      case "del":
        walk(node.children, { ...marks, strike: true }, out);
        break;
      case "link":
        walk(node.children, { ...marks, href: node.url }, out);
        break;
    }
  }
}

export function flatten(nodes: readonly Inline[]): IrRun[] {
  const out: IrRun[] = [];
  walk(nodes, {}, out);
  return out;
}

export function tabFills(runs: readonly IrRun[]): IrRun[] {
  return runs.map((run) => (run.fill ? { text: "", tab: true } : run));
}

export function onlyImages(runs: readonly IrRun[]): boolean {
  return (
    runs.some((run) => run.image) &&
    runs.every((run) => run.image || !run.text.trim())
  );
}

export function runsText(runs: readonly IrRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function isBlank(runs: readonly IrRun[]): boolean {
  return !runs.some((run) => run.image) && runsText(runs).trim() === "";
}
