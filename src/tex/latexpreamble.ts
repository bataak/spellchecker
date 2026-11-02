import { THEOREM_ENVS, theoremDefined, theoremLines } from "./texrequire.ts";

const BASE_PREAMBLE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[mongolian]{babel}
\\usepackage{paratype}
`;

const MATH_RE =
  /(?<!\\)\$|(?<!\\)\\[[(]|\\begin\{(?:math|displaymath|equation|align|gather|multline|flalign)\b/;

function theoremSetup(tex: string): (string | false)[] {
  const used = THEOREM_ENVS.filter((env) =>
    tex.includes("\\begin{" + env.name + "}"),
  );
  const needed = used.filter((env) => !theoremDefined(tex, env.name));
  return [
    (used.length > 0 || tex.includes("\\begin{proof}")) &&
      !/\{amsthm\}/.test(tex) &&
      "\\usepackage{amsthm}",
    ...needed.flatMap(theoremLines),
  ];
}

export function preambleFor(tex: string): string {
  const math = MATH_RE.test(tex);
  const lines = [
    (math || tex.includes("\\eqref")) && "\\usepackage{amsmath}",
    (math || /\\(?:checkmark|mathbb)\b/.test(tex)) && "\\usepackage{amssymb}",
    tex.includes("\\arraybackslash") && "\\usepackage{array}",
    tex.includes("\\toprule") && "\\usepackage{booktabs}",
    tex.includes("\\includegraphics") && "\\usepackage{graphicx}",
    math && "\\usepackage[OT1]{eulervm}",
    ...theoremSetup(tex),
    /\\(?:href|url)\{/.test(tex) && "\\usepackage{hyperref}",
    tex.includes("\\printindex") &&
      !/\{makeidx\}/.test(tex) &&
      "\\usepackage{makeidx}\n\\makeindex",
  ];
  const base = tex.includes("\\chapter")
    ? BASE_PREAMBLE.replace("{article}", "{report}")
    : BASE_PREAMBLE;
  return base + lines.filter((line) => typeof line === "string").join("\n");
}
