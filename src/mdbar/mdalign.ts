import { lineAt, lineEndAt, lineStartAt, type Edit } from "./mdedit.ts";

export type AlignKind = "left" | "center" | "right" | "signature";

const FENCE_OPEN = /^\s{0,3}(:{3,})\s*(\{[^{}]*\}|[^\s{}:]+)\s*:*\s*$/;
const FENCE_CLOSE = /^\s{0,3}:{3,}\s*$/;
const ALIGN_OPEN =
  /^\s{0,3}(:{3,})\s*(?:\{\s*\.(left|center|right|signature)\s*\}|(left|center|right|signature))\s*:*\s*$/;

interface AlignDiv {
  readonly kind: AlignKind;
  readonly fence: string;
  readonly open: number;
  readonly close: number;
}

function rowAt(text: string, pos: number): number {
  let row = 0;
  for (
    let i = text.indexOf("\n");
    i >= 0 && i < pos;
    i = text.indexOf("\n", i + 1)
  )
    row += 1;
  return row;
}

function enclosingAlign(
  lines: readonly string[],
  first: number,
  last: number,
): AlignDiv | null {
  let depth = 0;
  let open = -1;
  for (let i = first; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (FENCE_CLOSE.test(line)) {
      if (i !== first) depth += 1;
    } else if (FENCE_OPEN.test(line)) {
      if (depth === 0) {
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  const match = open < 0 ? null : ALIGN_OPEN.exec(lines[open]!);
  if (match === null) return null;
  depth = 0;
  for (let i = Math.max(last, open + 1); i < lines.length; i += 1) {
    const line = lines[i]!;
    if (FENCE_OPEN.test(line)) depth += 1;
    else if (FENCE_CLOSE.test(line)) {
      if (depth === 0)
        return {
          kind: (match[2] ?? match[3]) as AlignKind,
          fence: match[1]!,
          open,
          close: i,
        };
      depth -= 1;
    }
  }
  return null;
}

export function alignAt(text: string, pos: number): AlignKind | null {
  const row = rowAt(text, pos);
  return enclosingAlign(text.split("\n"), row, row)?.kind ?? null;
}

interface Change {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly push?: boolean;
}

function applyChanges(
  text: string,
  start: number,
  end: number,
  changes: readonly Change[],
): Edit {
  let out = text;
  let s = start;
  let e = end;
  const move = (pos: number, c: Change): number =>
    pos > c.to || (pos === c.to && (c.from < c.to || c.push === true))
      ? pos + c.insert.length - (c.to - c.from)
      : pos > c.from
        ? c.from
        : pos;
  const order = changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => b.change.from - a.change.from || b.index - a.index);
  for (const { change: c } of order) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    s = move(s, c);
    e = move(e, c);
  }
  return { text: out, start: s, end: e };
}

export function toggleAlign(
  text: string,
  start: number,
  end: number,
  kind: AlignKind,
): Edit {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }
  const lineEnd = (row: number): number => offsets[row]! + lines[row]!.length;
  const first = rowAt(text, start);
  const last = rowAt(
    text,
    end > start && text[end - 1] === "\n" ? end - 1 : end,
  );

  const found = enclosingAlign(lines, first, last);
  if (found !== null) {
    if (found.kind !== kind)
      return applyChanges(text, start, end, [
        {
          from: offsets[found.open]!,
          to: lineEnd(found.open),
          insert: found.fence + " {." + kind + "}",
        },
      ]);
    if (found.close === found.open + 1)
      return applyChanges(text, start, end, [
        {
          from: offsets[found.open]!,
          to:
            found.close === lines.length - 1
              ? lineEnd(found.close)
              : offsets[found.close + 1]!,
          insert: "",
        },
      ]);
    const closer =
      found.close === lines.length - 1
        ? { from: lineEnd(found.close - 1), to: lineEnd(found.close) }
        : { from: offsets[found.close]!, to: offsets[found.close + 1]! };
    return applyChanges(text, start, end, [
      { from: offsets[found.open]!, to: offsets[found.open + 1]!, insert: "" },
      { ...closer, insert: "" },
    ]);
  }

  const edge = (line: string): boolean =>
    !line.trim() || FENCE_OPEN.test(line) || FENCE_CLOSE.test(line);
  let top = first;
  let bottom = last;
  if (!edge(lines[top]!)) while (top > 0 && !edge(lines[top - 1]!)) top -= 1;
  if (!edge(lines[bottom]!))
    while (bottom < lines.length - 1 && !edge(lines[bottom + 1]!)) bottom += 1;
  return applyChanges(text, start, end, [
    {
      from: offsets[top]!,
      to: offsets[top]!,
      insert: "::: {." + kind + "}\n",
      push: true,
    },
    { from: lineEnd(bottom), to: lineEnd(bottom), insert: "\n:::" },
  ]);
}

const NAME_HOLDER = "Овог Нэр";

function signatureTable(date: Date): string {
  const day =
    String(date.getFullYear()) +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(date.getDate()).padStart(2, "0");
  const rows: [string, string][] = [
    ["Өргөдөл гаргасан:", NAME_HOLDER],
    ["Гарын үсэг:", "____"],
    ["Утас:", "____"],
    ["", day],
  ];
  const a = Math.max(...rows.map(([label]) => label.length));
  const b = Math.max(...rows.map(([, value]) => value.length));
  const row = (x: string, y: string): string => "| " + x + " | " + y + " |";
  return [
    row(" ".repeat(a), " ".repeat(b)),
    row("-".repeat(a - 1) + ":", ":" + "-".repeat(b - 1)),
    ...rows.map(([label, value]) => row(label.padStart(a), value.padEnd(b))),
  ].join("\n");
}

export function insertSignature(
  text: string,
  caret: number,
  date: Date,
): Edit | null {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  if (text.slice(from, to).trim()) return null;
  const row = rowAt(text, caret);
  if (enclosingAlign(text.split("\n"), row, row) !== null) return null;
  const before = from > 0 && lineAt(text, from - 1).trim() ? "\n" : "";
  const after = to < text.length && lineAt(text, to + 1).trim() ? "\n" : "";
  const block =
    before + "::: {.signature}\n" + signatureTable(date) + "\n:::" + after;
  const at = from + block.indexOf(NAME_HOLDER);
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: at,
    end: at + NAME_HOLDER.length,
  };
}
