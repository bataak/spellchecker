import {
  fencedRanges,
  lineBounds,
  mergeRanges,
  inlineRanges,
  type SkipRange,
  codeRanges,
  collect,
} from "./skipranges.ts";

const TEX_COMMENT = /(?<=(?:^|[^\\])(?:\\\\)*)%[^\n]*/g;

const TEX_VERBATIM =
  /\\begin\{((?:verbatim|Verbatim|lstlisting|minted|comment|tikzpicture|pspicture|filecontents|alltt)\*?)\}[\s\S]*?\\end\{\1\}/g;

const TEX_VERB = /\\verb\*?([^A-Za-z\s*])[^\n]*?\1/g;

const TEX_ARG = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;

const TEX_KEY_ARG = new RegExp(
  String.raw`\\(?:label|ref|eqref|pageref|autoref|nameref|[cC]ref|cite[pt]?|nocite|bibitem|usepackage|RequirePackage|documentclass|includegraphics|includepdf|input|include|bibliography|bibliographystyle|addbibresource|url|href|hypersetup|setlength|addtolength|setcounter|addtocounter|newcounter|pagestyle|thispagestyle|numberwithin|newtheorem|theoremstyle|color|textcolor|colorbox|definecolor|lstinputlisting|graphicspath|usetheme|usecolortheme|usefonttheme|setbeamertemplate|setbeamercolor|newcommand|renewcommand|providecommand|newenvironment|renewenvironment|vspace|hspace|vskip|hskip|geometry|selectlanguage|foreignlanguage)\*?(?:\s*\[[^\]\n]*\])*\s*` +
    TEX_ARG +
    String.raw`(?:\s*\[[^\]\n]*\])*`,
  "g",
);

const TEX_BREAK = /\\\\\*?\[[^\]\n]*\]/g;

const TEX_BEGIN_DOC = /\\begin\{document\}/;

const TEX_END_DOC = /\\end\{document\}/;

const TEX_SECTION =
  /^[ \t]*\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\*?\s*[[{]/m;

const TEX_MARKUP =
  /\\(?:emph|textbf|textit|texttt|textsc|underline|cite[pt]?|label|ref|eqref|href|url|footnote)\s*\{/g;

const TEX_SYNTAX =
  /\\(?:[A-Za-z@]+|[%$&#_{}])|^[ \t]*%|(?<![\\$\d])\$(?![\s$])[^$\n]*?[^\s$\\]\$(?!\d)/m;

export function hasTexSyntax(text: string): boolean {
  return TEX_SYNTAX.test(text);
}

export function looksLatex(text: string): boolean {
  if (/\\documentclass\b|\\begin\{document\}/.test(text)) return true;
  if (text.indexOf("\\") < 0) return false;
  let prose = "";
  let at = 0;
  const fenced = fencedRanges(text, lineBounds(text));
  for (const { start, end } of mergeRanges([
    ...fenced,
    ...inlineRanges(text, fenced),
  ])) {
    prose += text.slice(at, start) + "\n";
    at = end;
  }
  prose += text.slice(at);
  if (TEX_SECTION.test(prose)) return true;
  return (prose.match(TEX_MARKUP)?.length ?? 0) >= 2;
}

export function latexRanges(text: string): SkipRange[] {
  if (text.indexOf("\\") < 0 && text.indexOf("%") < 0 && text.indexOf("$") < 0)
    return [];

  const ranges: SkipRange[] = [];
  const begin = TEX_BEGIN_DOC.exec(text);
  if (begin !== null)
    ranges.push({ start: 0, end: begin.index + begin[0].length });
  const end = TEX_END_DOC.exec(text);
  if (end !== null) ranges.push({ start: end.index, end: text.length });

  return mergeRanges([
    ...ranges,
    ...codeRanges(text, true),
    ...collect(text, TEX_COMMENT),
    ...collect(text, TEX_VERBATIM),
    ...collect(text, TEX_VERB),
    ...collect(text, TEX_KEY_ARG),
    ...collect(text, TEX_BREAK),
  ]);
}
