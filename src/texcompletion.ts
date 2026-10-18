export type CompletionKind = "cmd" | "env";

export interface CompletionContext {
  kind: CompletionKind;
  from: number;
  prefix: string;
}

export interface Completion {
  label: string;
  snippet: string;
}

export interface Expansion {
  from: number;
  to: number;
  text: string;
  caret: number;
  closes: number[];
  body: number | null;
}

const COMMANDS = [
  "begin{#}",
  "end{#}",
  "section{#}",
  "subsection{#}",
  "subsubsection{#}",
  "section*{#}",
  "subsection*{#}",
  "paragraph{#}",
  "par",
  "chapter{#}",
  "part{#}",
  "textbf{#}",
  "textit{#}",
  "emph{#}",
  "underline{#}",
  "texttt{#}",
  "textsc{#}",
  "textrm{#}",
  "textsf{#}",
  "item",
  "label{#}",
  "ref{#}",
  "eqref{#}",
  "pageref{#}",
  "cite{#}",
  "footnote{#}",
  "url{#}",
  "href{#}{}",
  "includegraphics[width=\\linewidth]{#}",
  "caption{#}",
  "centering",
  "usepackage{#}",
  "usepackage[#]{}",
  "documentclass{#}",
  "documentclass[a4paper,12pt]{#}",
  "title{#}",
  "author{#}",
  "date{#}",
  "maketitle",
  "tableofcontents",
  "newpage",
  "clearpage",
  "newline",
  "linebreak",
  "noindent",
  "vspace{#}",
  "hspace{#}",
  "smallskip",
  "medskip",
  "bigskip",
  "hline",
  "toprule",
  "midrule",
  "bottomrule",
  "multicolumn{#}{}{}",
  "multirow{#}{}{}",
  "input{#}",
  "include{#}",
  "newcommand{#}{}",
  "renewcommand{#}{}",
  "bibliography{#}",
  "bibliographystyle{#}",
  "printbibliography",
  "frac{#}{}",
  "dfrac{#}{}",
  "sqrt{#}",
  "sum",
  "prod",
  "int",
  "iint",
  "oint",
  "lim",
  "infty",
  "partial",
  "nabla",
  "cdot",
  "cdots",
  "ldots",
  "dots",
  "times",
  "div",
  "pm",
  "mp",
  "leq",
  "geq",
  "neq",
  "approx",
  "equiv",
  "sim",
  "propto",
  "in",
  "notin",
  "subset",
  "subseteq",
  "supset",
  "cup",
  "cap",
  "emptyset",
  "forall",
  "exists",
  "neg",
  "land",
  "lor",
  "to",
  "rightarrow",
  "leftarrow",
  "Rightarrow",
  "Leftarrow",
  "leftrightarrow",
  "Leftrightarrow",
  "mapsto",
  "left(",
  "right)",
  "left[",
  "right]",
  "langle",
  "rangle",
  "mathbb{#}",
  "mathbf{#}",
  "mathrm{#}",
  "mathcal{#}",
  "mathit{#}",
  "text{#}",
  "operatorname{#}",
  "overline{#}",
  "underbrace{#}_{}",
  "overbrace{#}^{}",
  "hat{#}",
  "bar{#}",
  "vec{#}",
  "dot{#}",
  "tilde{#}",
  "binom{#}{}",
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "exp",
  "max",
  "min",
  "det",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Phi",
  "Psi",
  "Omega",
  "quad",
  "qquad",
];

const ENVIRONMENTS = [
  "itemize",
  "enumerate",
  "description",
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "figure[ht]",
  "table[ht]",
  "tabular{#}",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "quotation",
  "verbatim",
  "abstract",
  "document",
  "minipage{#}",
  "theorem",
  "lemma",
  "proof",
  "definition",
  "example",
  "remark",
  "frame",
  "columns",
  "column{#}",
  "thebibliography{#}",
];

const LIMIT = 8;

function entry(snippet: string): Completion {
  const cut = snippet.search(/[{[(#]|\)$|\]$/);
  const name = cut <= 0 ? snippet : snippet.slice(0, cut);
  const star = snippet.startsWith(name + "*") ? "*" : "";
  return { label: name + star, snippet };
}

function envEntry(snippet: string): Completion {
  const cut = snippet.search(/[{[]/);
  return { label: cut < 0 ? snippet : snippet.slice(0, cut), snippet };
}

const COMMAND_LIST = dedupe(COMMANDS.map(entry));
const ENV_LIST = ENVIRONMENTS.map(envEntry);

function dedupe(list: Completion[]): Completion[] {
  const out: Completion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = item.label + "\u0000" + item.snippet;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function inComment(text: string, caret: number): boolean {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  for (let i = lineStart; i < caret; i++) {
    const code = text.charCodeAt(i);
    if (code === 92) i++;
    else if (code === 37) return true;
  }
  return false;
}

export function completionContext(
  text: string,
  caret: number,
): CompletionContext | null {
  if (caret < 1 || caret > text.length) return null;
  if (caret < text.length && isLetter(text.charCodeAt(caret))) return null;

  let start = caret;
  while (start > 0 && isLetter(text.charCodeAt(start - 1))) start--;

  const env = /\\(?:begin|end)\{([A-Za-z]*\*?)$/.exec(
    text.slice(Math.max(0, start - 8), caret),
  );
  if (env && text.charCodeAt(caret - 1) !== 42) {
    const from = caret - env[1]!.length;
    if (inComment(text, from)) return null;
    return { kind: "env", from, prefix: env[1]! };
  }

  if (start === caret) return null;
  if (start < 1 || text.charCodeAt(start - 1) !== 92) return null;
  let slashes = 0;
  for (let i = start - 1; i >= 0 && text.charCodeAt(i) === 92; i--) slashes++;
  if (slashes % 2 === 0) return null;
  if (inComment(text, start - 1)) return null;
  return { kind: "cmd", from: start - 1, prefix: text.slice(start, caret) };
}

function rank(list: readonly Completion[], prefix: string): Completion[] {
  const exact: Completion[] = [];
  const starts: Completion[] = [];
  const folded: Completion[] = [];
  const lower = prefix.toLowerCase();
  for (const item of list) {
    if (item.label === prefix) exact.push(item);
    else if (item.label.startsWith(prefix)) starts.push(item);
    else if (item.label.toLowerCase().startsWith(lower)) folded.push(item);
  }
  return [...exact, ...starts, ...folded].slice(0, LIMIT);
}

export function completions(context: CompletionContext): Completion[] {
  if (context.kind === "env") return rank(ENV_LIST, context.prefix);
  const found = rank(COMMAND_LIST, context.prefix);
  if (found.length === 1 && found[0]!.label === context.prefix) {
    const only = found[0]!;
    if (only.snippet === only.label) return [];
  }
  return found;
}

export function unchanged(
  context: CompletionContext,
  item: Completion,
): boolean {
  return (
    context.kind === "cmd" &&
    item.snippet === item.label &&
    item.label === context.prefix
  );
}

function lineIndent(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, at));
  return match ? match[0] : "";
}

export function expand(
  text: string,
  caret: number,
  context: CompletionContext,
  item: Completion,
): Expansion {
  if (context.kind === "cmd") {
    const body = "\\" + item.snippet;
    const mark = body.indexOf("#");
    const inserted =
      mark < 0 ? body : body.slice(0, mark) + body.slice(mark + 1);
    return {
      from: context.from,
      to: caret,
      text: inserted,
      caret: context.from + (mark < 0 ? inserted.length : mark),
      closes: mark < 0 ? [] : groupCloses(inserted, mark, context.from),
      body: null,
    };
  }

  const opener = text.slice(Math.max(0, context.from - 7), context.from);
  const closing = text.charCodeAt(caret) === 125;
  const to = closing ? caret + 1 : caret;
  const name = item.label;
  const extra = item.snippet.slice(name.length);

  if (opener.endsWith("\\end{")) {
    const inserted = name + "}";
    return {
      from: context.from,
      to,
      text: inserted,
      caret: context.from + inserted.length,
      closes: [],
      body: null,
    };
  }

  const indent = lineIndent(text, context.from);
  const mark = extra.indexOf("#");
  const head = name + "}" + (mark < 0 ? extra : extra.replace("#", ""));
  const inner = "\n" + indent + "  ";
  const inserted = head + inner + "\n" + indent + "\\end{" + name + "}";
  const caretAt =
    mark < 0
      ? context.from + head.length + inner.length
      : context.from + name.length + 1 + mark;
  if (mark < 0)
    return {
      from: context.from,
      to,
      text: inserted,
      caret: caretAt,
      closes: [],
      body: null,
    };
  return {
    from: context.from,
    to,
    text: inserted,
    caret: caretAt,
    closes: groupCloses(head, name.length + 1 + mark, context.from),
    body: context.from + head.length + inner.length,
  };
}

function groupCloses(text: string, mark: number, offset: number): number[] {
  const out: number[] = [];
  for (let i = mark; i < text.length; i++)
    if (text[i] === "}" || text[i] === "]") out.push(offset + i);
  return out;
}
