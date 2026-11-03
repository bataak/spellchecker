import { TexSource } from "./texsource.ts";
import { preambleFor } from "./latexpreamble.ts";

const TEXT_FONTENC = /\\usepackage\[[^\]]*\b(?:T1|T2A)\b[^\]]*\]\{fontenc\}/;

const CYRILLIC_BABEL =
  /\\usepackage\[[^\]]*\b(?:mongolian|russian|ukrainian|bulgarian)\b[^\]]*\]\{babel\}/;

const FONT_PACKAGE =
  /\\usepackage(?:\[[^\]]*\])?\{(?:paratype|PTSerif|PTSans|cm-super|lmodern|tempora|fontspec)\}/;

const PREAMBLE_LINE = /^[ \t]*\\(?:usepackage|RequirePackage|makeindex)\b.*$/gm;

const DOCUMENT_CLASS = /\\documentclass\b/g;

const END_DOCUMENT = /\\end\s*\{document\}/g;

function fragmentParts(text: string): { head: string; body: string } {
  const begin = TexSource.of(text).documentStart();
  if (begin) {
    const rest = text.slice(begin.index + begin[0].length);
    const end = TexSource.of(rest).matches(END_DOCUMENT)[0];
    return {
      head: text.slice(0, begin.index),
      body: end ? rest.slice(0, end.index) : rest,
    };
  }
  const lines: string[] = [];
  const body = TexSource.of(text).replace(PREAMBLE_LINE, (line) => {
    lines.push(line);
    return "";
  });
  return { head: lines.join("\n"), body };
}

export function previewTex(text: string): string {
  if (TexSource.of(text).matches(DOCUMENT_CLASS).length) return text;
  const { head, body } = fragmentParts(text);
  return (
    preambleFor(head + "\n" + body) +
    "\n" +
    head.trim() +
    "\n\\begin{document}\n" +
    body +
    "\n\\end{document}\n"
  );
}

export function withParatype(text: string): string | null {
  const live = TexSource.of(text).live();
  if (FONT_PACKAGE.test(live)) return null;
  if (!TEXT_FONTENC.test(live) && !CYRILLIC_BABEL.test(live)) return null;
  const at = TexSource.of(text).documentStart()?.index;
  if (at === undefined) return null;
  return text.slice(0, at) + "\\usepackage{paratype}\n" + text.slice(at);
}
