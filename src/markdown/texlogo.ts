export type MathOpen = "$" | "$$" | "\\(" | "\\begin{math}";

const MATH_SHUT: Readonly<Record<MathOpen, string>> = {
  $: "$",
  $$: "$$",
  "\\(": "\\)",
  "\\begin{math}": "\\end{math}",
};

export function mathSource(open: MathOpen, value: string): string {
  return open + value + MATH_SHUT[open];
}

export type TexLogo = "TeX" | "LaTeX" | "LaTeXe";

const TEX_LOGO = /\\(LaTeXe|LaTeX|TeX)(?![A-Za-z])(?:\{\})?/g;

const TEXT_TOKEN = /\\(LaTeXe|LaTeX|TeX|today)(?![A-Za-z])(?:\{\})?/g;

export function todayText(date: Date = new Date()): string {
  return (
    String(date.getFullYear()) +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function dashes(text: string): string {
  return text.replaceAll("---", "\u2014").replaceAll("--", "\u2013");
}

export function withLogos(
  text: string,
  logo: (name: TexLogo) => string,
  plain: (part: string) => string,
): string {
  let out = "";
  let from = 0;
  let pending = "";
  for (const match of text.matchAll(TEXT_TOKEN)) {
    pending += text.slice(from, match.index);
    from = match.index + match[0].length;
    if (match[1] === "today") {
      pending += todayText();
      continue;
    }
    out += plain(pending) + logo(match[1] as TexLogo);
    pending = "";
  }
  return out + plain(pending + text.slice(from));
}

export function textLogos(value: string): string {
  return value.replace(TEX_LOGO, "\\text{\\$1}");
}

export const LOGO_HTML: Readonly<Record<TexLogo, string>> = {
  TeX: 'T<span class="tex-e">E</span>X',
  LaTeX: 'L<span class="tex-a">A</span>T<span class="tex-e">E</span>X',
  LaTeXe:
    'L<span class="tex-a">A</span>T<span class="tex-e">E</span>X2<span class="tex-eps">ε</span>',
};

export const LOGO_TEXT: Readonly<Record<TexLogo, string>> = {
  TeX: "TeX",
  LaTeX: "LaTeX",
  LaTeXe: "LaTeX2ε",
};
