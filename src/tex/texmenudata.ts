import { ICON, svg } from "../ui/baricons.ts";
import type { Insert } from "./texmenuedit.ts";

export interface MenuItem {
  readonly label: string;
  readonly insert: Insert;
}

export interface MenuSection {
  readonly title: string;
  readonly items: readonly MenuItem[];
}

export interface MathSymbol {
  readonly glyph: string;
  readonly command: string;
}

export interface SymbolTab {
  readonly title: string;
  readonly symbols: readonly MathSymbol[];
}

interface ToolBase {
  readonly id: string;
  readonly glyph: string;
  readonly title: string;
  readonly icon?: string;
  readonly gap?: true;
}

export type BarTool =
  | (ToolBase & { readonly kind: "action"; readonly insert: Insert })
  | (ToolBase & {
      readonly kind: "list";
      readonly sections: readonly MenuSection[];
    })
  | (ToolBase & {
      readonly kind: "palette";
      readonly tabs: readonly SymbolTab[];
    });

const cmd = (snippet: string): Insert => ({ kind: "cmd", snippet });
const env = (snippet: string, ...body: string[]): Insert =>
  body.length ? { kind: "env", snippet, body } : { kind: "env", snippet };
const text = (snippet: string): Insert => ({ kind: "text", snippet });

const item = (label: string, insert: Insert): MenuItem => ({ label, insert });

function symbols(pairs: string): MathSymbol[] {
  const words = pairs.trim().split(/\s+/);
  const out: MathSymbol[] = [];
  for (let at = 0; at + 1 < words.length; at += 2)
    out.push({ glyph: words[at]!, command: words[at + 1]! });
  return out;
}

const STRUCTURE_SECTIONS: readonly MenuSection[] = [
  {
    title: "Бүлэг",
    items: [
      item("Хэсэг", cmd("part{#}")),
      item("Бүлэг", cmd("chapter{#}")),
      item("Дэд бүлэг", cmd("section{#}")),
      item("Хэсэг бүлэг", cmd("subsection{#}")),
      item("Жижиг хэсэг", cmd("subsubsection{#}")),
      item("Догол", cmd("paragraph{#}")),
    ],
  },
  {
    title: "Баримт",
    items: [
      item("Гарчиг үүсгэх", cmd("maketitle")),
      item("Агуулга", cmd("tableofcontents")),
      item("Хураангуй", env("abstract")),
      item("Хавсралт", cmd("appendix")),
      item("Шинэ хуудас", cmd("newpage")),
    ],
  },
];

const FONT_SECTIONS: readonly MenuSection[] = [
  {
    title: "Үсэг",
    items: [
      item("Онцлох", cmd("emph{#}")),
      item("Доогуур зураас", cmd("underline{#}")),
      item("Тэгш өргөнтэй", cmd("texttt{#}")),
      item("Жижиг том үсэг", cmd("textsc{#}")),
      item("Зүүлт", cmd("footnote{#}")),
    ],
  },
  {
    title: "Хэмжээ",
    items: [
      item("Маш жижиг", text("{\\footnotesize #}")),
      item("Жижиг", text("{\\small #}")),
      item("Том", text("{\\large #}")),
      item("Илүү том", text("{\\Large #}")),
      item("Асар том", text("{\\huge #}")),
    ],
  },
  {
    title: "Жагсаалт",
    items: [
      item("Тайлбартай", env("description", "\\item[#] ")),
      item("Мөр нэмэх", cmd("item ")),
    ],
  },
];

const MATH_SECTIONS: readonly MenuSection[] = [
  {
    title: "Томьёо",
    items: [
      item("Тусдаа мөрөнд", text("\\[\n#\n\\]")),
      item("Дугаартай", env("equation")),
      item("Дугааргүй", env("equation*")),
      item("Тэгшилсэн", env("align")),
      item("Тэгшилсэн, дугааргүй", env("align*")),
      item("Нөхцөлт", env("cases")),
    ],
  },
  {
    title: "Бүтэц",
    items: [
      item("Зэрэг", text("^{#}")),
      item("n зэргийн язгуур", cmd("sqrt[#]{}")),
      item("Индекс", text("_{#}")),
      item("Нийлбэр", cmd("sum_{#}^{}")),
      item("Үржвэр", cmd("prod_{#}^{}")),
      item("Хязгаар", cmd("lim_{#}")),
      item("Хослол", cmd("binom{#}{}")),
      item("Матриц [ ]", env("bmatrix")),
    ],
  },
  {
    title: "Тэмдэглэгээ",
    items: [
      item("Вектор", cmd("vec{#}")),
      item("Малгай", cmd("hat{#}")),
      item("Дээд зураас", cmd("overline{#}")),
      item("Цэг", cmd("dot{#}")),
      item("Олонлог 𝔸", cmd("mathbb{#}")),
      item("Бичмэл 𝒜", cmd("mathcal{#}")),
      item("Шулуун үсэг", cmd("mathrm{#}")),
      item("Бичвэр", cmd("text{#}")),
    ],
  },
];

const ENV_SECTIONS: readonly MenuSection[] = [
  {
    title: "Байршил",
    items: [
      item("Голлуулах", env("center")),
      item("Жижиг хуудас", env("minipage{#}")),
      item("Зураг оруулах", cmd("includegraphics[width=\\linewidth]{#}")),
      item("Хүснэгтийн бие", env("tabular{#}")),
      item("Тайлбар", cmd("caption{#}")),
    ],
  },
  {
    title: "Текст",
    items: [
      item("Ишлэл", env("quote")),
      item("Урт ишлэл", env("quotation")),
      item("Шүлэг", env("verse")),
      item("Хувиргахгүй", env("verbatim")),
    ],
  },
  {
    title: "Теорем",
    items: [
      item("Теорем", env("theorem")),
      item("Лемм", env("lemma")),
      item("Тодорхойлолт", env("definition")),
      item("Жишээ", env("example")),
      item("Тайлбар", env("remark")),
      item("Баталгаа", env("proof")),
    ],
  },
  {
    title: "Слайд",
    items: [
      item("Слайд", env("frame")),
      item("Багана", env("columns")),
      item("Блок", env("block{#}")),
    ],
  },
];

const LINK_SECTIONS: readonly MenuSection[] = [
  {
    title: "Холбоос",
    items: [
      item("Шошго", cmd("label{#}")),
      item("Томьёо заах", cmd("eqref{#}")),
      item("Хуудас заах", cmd("pageref{#}")),
    ],
  },
  {
    title: "Товъёг",
    items: [
      item("Товъёгийн үг", cmd("index{#}")),
      item("Товъёг хэвлэх", cmd("printindex")),
    ],
  },
  {
    title: "Вэб",
    items: [
      item("Хаяг", cmd("url{#}")),
      item("Холбоостой бичвэр", cmd("href{#}{}")),
    ],
  },
];

const SYMBOL_TABS: readonly SymbolTab[] = [
  {
    title: "Грек",
    symbols: symbols(`
      α alpha β beta γ gamma δ delta ϵ epsilon ε varepsilon ζ zeta η eta
      θ theta ϑ vartheta ι iota κ kappa λ lambda μ mu ν nu ξ xi π pi
      ϖ varpi ρ rho ϱ varrho σ sigma ς varsigma τ tau υ upsilon φ varphi
      ϕ phi χ chi ψ psi ω omega
      Γ Gamma Δ Delta Θ Theta Λ Lambda Ξ Xi Π Pi Σ Sigma Υ Upsilon
      Φ Phi Ψ Psi Ω Omega`),
  },
  {
    title: "Харьцаа",
    symbols: symbols(`
      ≤ leq ≥ geq ≠ neq ≈ approx ≡ equiv ∼ sim ≃ simeq ≅ cong ∝ propto
      ≪ ll ≫ gg ∈ in ∉ notin ∋ ni ⊂ subset ⊆ subseteq ⊃ supset ⊇ supseteq
      ⊥ perp ∥ parallel ∣ mid ≺ prec ≻ succ ⊢ vdash ⊨ models`),
  },
  {
    title: "Үйлдэл",
    symbols: symbols(`
      ± pm ∓ mp × times ÷ div · cdot ∘ circ • bullet ⋆ star ⊕ oplus
      ⊗ otimes ∪ cup ∩ cap ∖ setminus ∧ wedge ∨ vee ¬ neg ∑ sum ∏ prod
      ∫ int ∬ iint ∮ oint ∂ partial ∇ nabla √ sqrt{#} ⋃ bigcup ⋂ bigcap`),
  },
  {
    title: "Сум",
    symbols: symbols(`
      → to ← leftarrow ↔ leftrightarrow ⇒ Rightarrow ⇐ Leftarrow
      ⇔ Leftrightarrow ⟹ implies ⟺ iff ↦ mapsto ↑ uparrow ↓ downarrow
      ↗ nearrow ↘ searrow ↪ hookrightarrow ⟶ longrightarrow ⇌ rightleftharpoons`),
  },
  {
    title: "Бусад",
    symbols: symbols(`
      ∞ infty ∀ forall ∃ exists ∅ emptyset ℓ ell ℏ hbar ℝ mathbb{R}
      ℕ mathbb{N} ℤ mathbb{Z} ℚ mathbb{Q} ℂ mathbb{C} … ldots ⋯ cdots
      ⋮ vdots ⋱ ddots ′ prime ∠ angle △ triangle □ square ∴ therefore
      ∵ because ⌊ lfloor ⌋ rfloor ⌈ lceil ⌉ rceil ⟨ langle ⟩ rangle`),
  },
];

const action = (
  id: string,
  glyph: string,
  title: string,
  insert: Insert,
  extra: Partial<Pick<ToolBase, "icon" | "gap">> = {},
): BarTool => ({ kind: "action", id, glyph, title, insert, ...extra });

const list = (
  id: string,
  glyph: string,
  title: string,
  sections: readonly MenuSection[],
  extra: Partial<Pick<ToolBase, "icon" | "gap">> = {},
): BarTool => ({ kind: "list", id, glyph, title, sections, ...extra });

export const TEX_TOOLS: readonly BarTool[] = [
  list("structure", "§", "Бүлэг, баримтын бүтэц", STRUCTURE_SECTIONS),
  action("bold", "B", "Тод (\\textbf)", cmd("textbf{#}"), { gap: true }),
  action("italic", "I", "Налуу (\\textit)", cmd("textit{#}")),
  list("font", "Aa", "Үсгийн хэлбэр, хэмжээ", FONT_SECTIONS),
  action("itemize", "•", "Цэгтэй жагсаалт", env("itemize", "\\item #"), {
    icon: svg(ICON.bullet),
    gap: true,
  }),
  action(
    "enumerate",
    "1.",
    "Дугаартай жагсаалт",
    env("enumerate", "\\item #"),
    {
      icon: svg(ICON.ordered),
    },
  ),
  action("inline", "$x$", "Мөр доторх томьёо ($…$)", text("$#$"), {
    gap: true,
  }),
  action("frac", "a⁄b", "Бутархай (\\frac)", cmd("frac{#}{}")),
  action("sqrt", "√x", "Язгуур (\\sqrt)", cmd("sqrt{#}")),
  action("integral", "∫", "Интеграл (\\int)", cmd("int_{#}^{}")),
  action(
    "matrix",
    "( )",
    "Матриц (pmatrix)",
    env("pmatrix", "# & \\\\", "& "),
    {
      icon: svg(ICON.matrix),
    },
  ),
  action(
    "system",
    "{",
    "Нэг хаалттай систем",
    {
      kind: "env",
      snippet: "aligned",
      around: ["\\left\\{", "\\right."],
      body: ["# \\\\", ""],
    },
    { icon: svg(ICON.system) },
  ),
  list("math", "∑", "Томьёоны орчин, бүтэц", MATH_SECTIONS),
  {
    kind: "palette",
    id: "symbols",
    glyph: "Ω",
    title: "Тэмдэг",
    tabs: SYMBOL_TABS,
  },
  action(
    "figure",
    "▧",
    "Зураг (figure)",
    env(
      "figure[ht]",
      "\\centering",
      "\\includegraphics[width=\\linewidth]{#}",
      "\\caption{}",
      "\\label{fig:}",
    ),
    { icon: svg(ICON.image), gap: true },
  ),
  action(
    "table",
    "▦",
    "Хүснэгт (table)",
    env(
      "table[ht]",
      "\\centering",
      "\\caption{#}",
      "\\label{tab:}",
      "\\begin{tabular}{ll}",
      "  a & b \\\\",
      "\\end{tabular}",
    ),
    { icon: svg(ICON.table) },
  ),
  list("env", "⊞", "Орчин: голлуулах, ишлэл, теорем", ENV_SECTIONS, {
    icon: svg(ICON.environment),
  }),
  action("close", "⤶", "Нээлттэй орчныг хаах", { kind: "close" }),
  action("ref", "↪", "Шошгоор заах (\\ref)", cmd("ref{#}"), { gap: true }),
  action("cite", "❝", "Ишлэх (\\cite)", cmd("cite{#}"), {
    icon: svg(ICON.quote),
  }),
  list("links", "⋯", "Шошго, товъёг, вэб холбоос", LINK_SECTIONS, {
    icon: svg(ICON.link),
  }),
];
