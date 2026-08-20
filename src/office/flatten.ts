import type { Inline } from "../markdown.ts";
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
  if (!text) return;
  const last = out.at(-1);
  if (last && sameMarks(last, marks)) {
    out[out.length - 1] = { ...last, text: last.text + text };
    return;
  }
  out.push(withMarks(text, marks));
}

function walk(nodes: readonly Inline[], marks: Marks, out: IrRun[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        push(out, node.value, marks);
        break;
      case "code":
        push(out, node.value, { ...marks, mono: true });
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

export function runsText(runs: readonly IrRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function isBlank(runs: readonly IrRun[]): boolean {
  return runsText(runs).trim() === "";
}
