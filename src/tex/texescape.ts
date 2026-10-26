const SPECIAL: Readonly<Record<string, string>> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "%": "\\%",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

const SYMBOL: Readonly<Record<string, string>> = {
  "≈": "\\ensuremath{\\approx}",
  "≠": "\\ensuremath{\\neq}",
  "≤": "\\ensuremath{\\leq}",
  "≥": "\\ensuremath{\\geq}",
  "±": "\\ensuremath{\\pm}",
  "×": "\\ensuremath{\\times}",
  "÷": "\\ensuremath{\\div}",
  "−": "\\ensuremath{-}",
  "→": "\\ensuremath{\\rightarrow}",
  "←": "\\ensuremath{\\leftarrow}",
  "↑": "\\ensuremath{\\uparrow}",
  "↓": "\\ensuremath{\\downarrow}",
  "⇒": "\\ensuremath{\\Rightarrow}",
  "∞": "\\ensuremath{\\infty}",
  "·": "\\ensuremath{\\cdot}",
  "√": "\\ensuremath{\\surd}",
  "✓": "\\ensuremath{\\checkmark}",
  "•": "\\textbullet{}",
  "°": "\\textdegree{}",
  "‰": "\\textperthousand{}",
  "€": "\\texteuro{}",
  "₮": "\\texttugrik{}",
  "∑": "\\ensuremath{\\sum}",
  "∏": "\\ensuremath{\\prod}",
  "∫": "\\ensuremath{\\int}",
  "∂": "\\ensuremath{\\partial}",
  "∆": "\\ensuremath{\\Delta}",
  "∇": "\\ensuremath{\\nabla}",
  "∈": "\\ensuremath{\\in}",
  "∉": "\\ensuremath{\\notin}",
  "∀": "\\ensuremath{\\forall}",
  "∃": "\\ensuremath{\\exists}",
  "∅": "\\ensuremath{\\emptyset}",
  "⊂": "\\ensuremath{\\subset}",
  "⊃": "\\ensuremath{\\supset}",
  "⊆": "\\ensuremath{\\subseteq}",
  "⊇": "\\ensuremath{\\supseteq}",
  "∪": "\\ensuremath{\\cup}",
  "∩": "\\ensuremath{\\cap}",
  "∧": "\\ensuremath{\\wedge}",
  "∨": "\\ensuremath{\\vee}",
  "⇔": "\\ensuremath{\\Leftrightarrow}",
  "↔": "\\ensuremath{\\leftrightarrow}",
  "⇐": "\\ensuremath{\\Leftarrow}",
  "≡": "\\ensuremath{\\equiv}",
  "∼": "\\ensuremath{\\sim}",
  "≅": "\\ensuremath{\\cong}",
  "∝": "\\ensuremath{\\propto}",
  "⊥": "\\ensuremath{\\perp}",
  "∥": "\\ensuremath{\\parallel}",
  "∓": "\\ensuremath{\\mp}",
  "≪": "\\ensuremath{\\ll}",
  "≫": "\\ensuremath{\\gg}",
  "∘": "\\ensuremath{\\circ}",
  "⋅": "\\ensuremath{\\cdot}",
  "′": "\\ensuremath{{}^{\\prime}}",
  "″": "\\ensuremath{{}^{\\prime\\prime}}",
  "★": "\\ensuremath{\\star}",
  "♥": "\\ensuremath{\\heartsuit}",
  ℝ: "\\ensuremath{\\mathbb{R}}",
  ℕ: "\\ensuremath{\\mathbb{N}}",
  ℤ: "\\ensuremath{\\mathbb{Z}}",
  ℚ: "\\ensuremath{\\mathbb{Q}}",
  ℂ: "\\ensuremath{\\mathbb{C}}",
  "✔": "\\ensuremath{\\checkmark}",
  "✅": "\\ensuremath{\\checkmark}",
};

const GREEK =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi o pi rho varsigma sigma tau upsilon phi chi psi omega".split(
    " ",
  );
const GREEK_UPPER: Readonly<Record<string, string>> = {
  Γ: "Gamma",
  Δ: "Delta",
  Θ: "Theta",
  Λ: "Lambda",
  Ξ: "Xi",
  Π: "Pi",
  Σ: "Sigma",
  Υ: "Upsilon",
  Φ: "Phi",
  Ψ: "Psi",
  Ω: "Omega",
};
const GREEK_LATIN = "ABΓΔEZHΘIKΛMNΞOΠP΢ΣTΥΦXΨΩ";

function greek(ch: string): string | null {
  const code = ch.codePointAt(0)!;
  if (code >= 0x3b1 && code <= 0x3c9) {
    const name = GREEK[code - 0x3b1]!;
    return name === "o" ? "o" : "\\ensuremath{\\" + name + "}";
  }
  if (code >= 0x391 && code <= 0x3a9) {
    const upper = GREEK_UPPER[ch];
    if (upper) return "\\ensuremath{\\" + upper + "}";
    const latin = GREEK_LATIN[code - 0x391]!;
    return latin === "΢" ? null : latin;
  }
  return null;
}

const GREEK_RE = /[\u0391-\u03a9\u03b1-\u03c9]/gu;
const ZERO_WIDTH = /\u200b|\u200c|\u200d|\u2060|\ufe0e|\ufe0f|\ufeff/gu;

const SYMBOL_RE = new RegExp("[" + Object.keys(SYMBOL).join("") + "]", "gu");

export function escapeTex(s: string): string {
  return s
    .replace(ZERO_WIDTH, "")
    .replace(/[\\{}$&%#_~^]/g, (c) => SPECIAL[c]!)
    .replace(SYMBOL_RE, (c) => SYMBOL[c]!)
    .replace(GREEK_RE, (c) => greek(c) ?? c);
}
