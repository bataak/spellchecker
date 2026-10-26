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
}

export type BarTool =
  | (ToolBase & { readonly kind: "action"; readonly insert: Insert })
  | (ToolBase & {
      readonly kind: "list";
      readonly sections: readonly MenuSection[];
    })
  | (ToolBase & {
      readonly kind: "split";
      readonly insert: Insert;
      readonly sections: readonly MenuSection[];
    })
  | (ToolBase & {
      readonly kind: "palette";
      readonly tabs: readonly SymbolTab[];
    });

const cmd = (snippet: string): Insert => ({ kind: "cmd", snippet });
const env = (snippet: string): Insert => ({ kind: "env", snippet });
const text = (snippet: string): Insert => ({ kind: "text", snippet });

const item = (label: string, insert: Insert): MenuItem => ({ label, insert });

function symbols(pairs: string): MathSymbol[] {
  const words = pairs.trim().split(/\s+/);
  const out: MathSymbol[] = [];
  for (let at = 0; at + 1 < words.length; at += 2)
    out.push({ glyph: words[at]!, command: words[at + 1]! });
  return out;
}

const TEXT_SECTIONS: readonly MenuSection[] = [
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
    title: "Үсэг",
    items: [
      item("Тод", cmd("textbf{#}")),
      item("Налуу", cmd("textit{#}")),
      item("Онцлох", cmd("emph{#}")),
      item("Доогуур зураас", cmd("underline{#}")),
      item("Тэгш өргөнтэй", cmd("texttt{#}")),
      item("Жижиг том үсэг", cmd("textsc{#}")),
      item("Зүүлт", cmd("footnote{#}")),
    ],
  },
  {
    title: "Жагсаалт",
    items: [
      item("Цэгтэй", env("itemize")),
      item("Дугаартай", env("enumerate")),
      item("Тайлбартай", env("description")),
      item("Мөр нэмэх", cmd("item ")),
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

const MATH_SECTIONS: readonly MenuSection[] = [
  {
    title: "Томьёо",
    items: [
      item("Мөр доторх", text("$#$")),
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
      item("Бутархай", cmd("frac{#}{}")),
      item("Язгуур", cmd("sqrt{#}")),
      item("n зэргийн язгуур", cmd("sqrt[#]{}")),
      item("Зэрэг", text("^{#}")),
      item("Индекс", text("_{#}")),
      item("Нийлбэр", cmd("sum_{#}^{}")),
      item("Интеграл", cmd("int_{#}^{}")),
      item("Хязгаар", cmd("lim_{#}")),
      item("Хослол", cmd("binom{#}{}")),
      item("Матриц ( )", env("pmatrix")),
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
    title: "Зураг, хүснэгт",
    items: [
      item("Зураг", env("figure[ht]")),
      item("Зураг оруулах", cmd("includegraphics[width=\\linewidth]{#}")),
      item("Хүснэгт", env("table[ht]")),
      item("Хүснэгтийн бие", env("tabular{#}")),
      item("Тайлбар", cmd("caption{#}")),
      item("Голлуулах", env("center")),
      item("Жижиг хуудас", env("minipage{#}")),
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
  {
    title: "Засвар",
    items: [item("Нээлттэй орчныг хаах", { kind: "close" })],
  },
];

const LINK_SECTIONS: readonly MenuSection[] = [
  {
    title: "Холбоос",
    items: [
      item("Шошго", cmd("label{#}")),
      item("Шошгоор заах", cmd("ref{#}")),
      item("Томьёо заах", cmd("eqref{#}")),
      item("Хуудас заах", cmd("pageref{#}")),
    ],
  },
  {
    title: "Ном зүй, индекс",
    items: [
      item("Ишлэх", cmd("cite{#}")),
      item("Индексийн үг", cmd("index{#}")),
      item("Индекс хэвлэх", cmd("printindex")),
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
      α alpha β beta γ gamma δ delta ε varepsilon ζ zeta η eta θ theta
      ι iota κ kappa λ lambda μ mu ν nu ξ xi π pi ρ rho σ sigma τ tau
      υ upsilon φ varphi χ chi ψ psi ω omega Γ Gamma Δ Delta Θ Theta
      Λ Lambda Ξ Xi Π Pi Σ Sigma Φ Phi Ψ Psi Ω Omega ϵ epsilon ϑ vartheta
      ϕ phi ϱ varrho ς varsigma`),
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

export const TEX_TOOLS: readonly BarTool[] = [
  {
    kind: "list",
    id: "text",
    glyph: "§",
    title: "Бичвэр: бүлэг, үсэг, жагсаалт",
    sections: TEXT_SECTIONS,
  },
  {
    kind: "action",
    id: "bold",
    glyph: "B",
    title: "Тод (\\textbf)",
    insert: cmd("textbf{#}"),
  },
  {
    kind: "action",
    id: "italic",
    glyph: "I",
    title: "Налуу (\\textit)",
    insert: cmd("textit{#}"),
  },
  {
    kind: "split",
    id: "math",
    glyph: "x²",
    title: "Томьёо ($…$)",
    insert: text("$#$"),
    sections: MATH_SECTIONS,
  },
  {
    kind: "palette",
    id: "symbols",
    glyph: "Ω",
    title: "Тэмдэг",
    tabs: SYMBOL_TABS,
  },
  {
    kind: "list",
    id: "env",
    glyph: "⊞",
    title: "Орчин: зураг, хүснэгт, теорем",
    sections: ENV_SECTIONS,
  },
  {
    kind: "list",
    id: "links",
    glyph: "↪",
    title: "Холбоос, ишлэл, индекс",
    sections: LINK_SECTIONS,
  },
];
