import type { LatexBlock, MathBlock } from "./ast.ts";

export const MATH_RE = /^\s*(?:\$\$|\\\[|\\begin\{[A-Za-z]+\*?\})/;

const MATH_ENVS = new Set(
  [
    "equation",
    "align",
    "gather",
    "multline",
    "displaymath",
    "flalign",
    "alignat",
    "aligned",
    "gathered",
    "split",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "smallmatrix",
  ].flatMap((name) => [name, name + "*"]),
);

const TEXT_ENVS = new Set([
  "itemize",
  "enumerate",
  "description",
  "tabular",
  "table",
  "figure",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "verbatim",
  "abstract",
  "proof",
  "theorem",
  "definition",
]);

export const MATH_CLOSE = { $$: "$$", "\\[": "\\]" } as const;

function envEnd(
  lines: readonly string[],
  start: number,
  env: string,
  math: boolean,
): number {
  const verbatim = env === "verbatim";
  const edge = verbatim
    ? /\\end\{verbatim\}/g
    : new RegExp("\\\\(begin|end)\\{" + env.replace("*", "\\*") + "\\}", "g");
  let depth = verbatim ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const line =
      verbatim && i === start ? raw.slice(raw.indexOf("}") + 1) : raw;
    if (math && i > start && !line.trim()) return -1;
    for (const m of line.matchAll(edge)) {
      depth += m[1] === "begin" ? 1 : -1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const mathStops = new WeakMap<readonly string[], Map<string, Int32Array>>();

function mathStop(
  lines: readonly string[],
  close: string,
  from: number,
): number {
  let byClose = mathStops.get(lines);
  if (!byClose) mathStops.set(lines, (byClose = new Map()));
  let stops = byClose.get(close);
  if (!stops) {
    stops = new Int32Array(lines.length + 1);
    stops[lines.length] = lines.length;
    for (let j = lines.length - 1; j >= 0; j -= 1) {
      const line = lines[j]!.trimEnd();
      stops[j] = !line.trim() || line.endsWith(close) ? j : stops[j + 1]!;
    }
    byClose.set(close, stops);
  }
  return stops[Math.min(from, lines.length)]!;
}

export function displayMath(
  lines: readonly string[],
  start: number,
): { block: MathBlock | LatexBlock; next: number } | null {
  const head = lines[start]!.trim();
  const env = /^\\begin\{([A-Za-z]+\*?)\}/.exec(head)?.[1];
  if (env !== undefined) {
    const math = MATH_ENVS.has(env);
    if (!math && !TEXT_ENVS.has(env)) return null;
    const end = envEnd(lines, start, env, math);
    if (end < 0) return null;
    const value = lines
      .slice(start, end + 1)
      .join("\n")
      .trim();
    return {
      block: math
        ? { type: "math", fence: "env", value, line: start }
        : { type: "latex", env, value, line: start },
      next: end + 1,
    };
  }

  const fence: "$$" | "\\[" = head.startsWith("$$") ? "$$" : "\\[";
  const close = MATH_CLOSE[fence];
  let body = head.slice(2);
  const inner = body.indexOf(close);
  if (inner >= 0 && inner + close.length < body.length) return null;

  let i = start + 1;
  if (!body.endsWith(close)) {
    const end = mathStop(lines, close, i);
    const last = lines[end]?.trimEnd();
    if (last === undefined || !last.trim()) return null;
    body +=
      "\n" +
      lines
        .slice(i, end + 1)
        .map((line) => line.trimEnd())
        .join("\n");
    i = end + 1;
  }
  return {
    block: {
      type: "math",
      fence,
      value: body.slice(0, -close.length).trim(),
      line: start,
    },
    next: i,
  };
}
