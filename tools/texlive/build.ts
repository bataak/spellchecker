import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { unzipSync, zipSync } from "fflate";

import { parse, type Block } from "../../src/markdown.ts";
import { BEAMER_PREAMBLE, toBeamer, toLatex } from "../../src/latex.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const CACHE = join(HERE, ".cache");
const ENGINE = join(CACHE, "swiftlatex");
const OUT = process.env["TEX_OUT"] ?? join(ROOT, "public/tex");
const MODULE = process.env["TEX_OUT"]
  ? join(OUT, "texbundle.ts")
  : join(ROOT, "src/texbundle.ts");

const RELEASE =
  "https://github.com/SwiftLaTeX/SwiftLaTeX/releases/download/v20022022/20-02-2022.zip";
const RELEASE_SHA256 =
  "cf5535ffe9cdf42f7c4522e96bba4d33db10c418a7ceb24e5d80504be7de7150";

const LANGUAGE_DAT = `english hyphen.tex
=usenglish
=USenglish
=american
dumylang dumyhyph.tex
nohyphenation zerohyph.tex
mongolian loadhyph-mn-cyrl.tex
`;

interface CompileResult {
  readonly ok: boolean;
  readonly log: string;
  readonly pdf: Uint8Array | null;
  readonly served: ReadonlyMap<string, string>;
}

async function fetchEngine(): Promise<void> {
  if (existsSync(join(ENGINE, "swiftlatexpdftex.wasm"))) return;
  const response = await fetch(RELEASE);
  if (!response.ok) throw new Error("download failed: " + response.status);
  const zip = new Uint8Array(await response.arrayBuffer());
  const sum = createHash("sha256").update(zip).digest("hex");
  if (sum !== RELEASE_SHA256) throw new Error("checksum mismatch: " + sum);
  mkdirSync(ENGINE, { recursive: true });
  for (const [name, data] of Object.entries(unzipSync(zip))) {
    if (/^(swiftlatexpdftex\.(js|wasm))$/.test(basename(name)))
      writeFileSync(join(ENGINE, basename(name)), data);
  }
}

function run(
  cmd: "compileformat" | "compilelatex",
  overrides: Record<string, string>,
  source?: string,
): Promise<CompileResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(HERE, "engine-worker.cjs"), {
      workerData: { engine: ENGINE, overrides },
    });
    worker.on("error", reject);
    worker.on("message", (message) => {
      if (message.result === "ok" && message.cmd === undefined) {
        if (source !== undefined) {
          worker.postMessage({
            cmd: "writefile",
            url: "main.tex",
            src: source,
          });
          worker.postMessage({ cmd: "setmainfile", url: "main.tex" });
        }
        worker.postMessage({ cmd });
        return;
      }
      if (message.cmd !== "compile") return;
      void worker.terminate();
      resolve({
        ok: message.result === "ok",
        log: message.log ?? "",
        pdf: message.pdf ? new Uint8Array(message.pdf) : null,
        served: new Map(message.served as [string, string][]),
      });
    });
  });
}

const SAMPLE_MD = `# Гарчиг

## Дэд гарчиг

### Гуравдугаар түвшин

Энгийн **тод**, *налуу*, ***тод налуу***, ~~зураас~~, \`код\`,
[холбоос](https://bichig.dev) ба <https://bichig.dev>. English text.
Өө Үү Ёё Ээ № « » — – “ ” ‘ ’ … © € ° ±.

- нэг
- хоёр

1. нэг
2. хоёр

> Ишлэл.

\`\`\`
код блок
\`\`\`

| Нэр | Тоо |
| :-- | --: |
| А | 1 |

---

Томьёо $a$, \\(b\\), \\begin{math}c\\end{math}, $$d$$.

\\[
\\left( \\frac{\\sum_{i=1}^{n} x_i^2}{\\sqrt{\\alpha + \\beta}} \\right)
\\int_0^\\infty e^{-x} \\, dx \\ne \\prod_{k} \\Gamma_k \\le \\infty
\\]

\\begin{displaymath}
\\mathcal{A} \\mathbf{v} \\mathit{x} \\mathrm{d}
\\mathsf{s} \\mathtt{t} \\mathbold{a} \\sin x \\log y \\hat{a} \\tilde{b}
\\vec{c} \\bar{d} \\dot{e} \\{ \\langle \\rangle \\| \\cdot \\times \\pm
\\to \\Rightarrow \\in \\subset \\cup \\cap \\forall \\exists \\partial \\nabla
\\end{displaymath}

\\begin{equation}
E = mc^2
\\end{equation}

\\begin{equation*}
a^2 + b^2 = c^2
\\end{equation*}

\\begin{align}
x &= 1 \\\\
y &= 2
\\end{align}

\\begin{align*}
x &= 1
\\end{align*}

\\begin{gather}
a = b
\\end{gather}

\\begin{multline}
a + b \\\\
+ c
\\end{multline}

\\begin{cases}
1 & x > 0 \\\\
0 & x \\le 0
\\end{cases}

\\begin{matrix}
1 & 2
\\end{matrix}

\\begin{pmatrix}
1 & 2
\\end{pmatrix}

\\begin{bmatrix}
1 & 2
\\end{bmatrix}

\\begin{Bmatrix}
1 & 2
\\end{Bmatrix}

\\begin{vmatrix}
1 & 2
\\end{vmatrix}

\\begin{Vmatrix}
1 & 2
\\end{Vmatrix}

\\begin{itemize}
\\item Нэг
\\begin{itemize}
\\item Хоёр
\\begin{itemize}
\\item Гурав
\\end{itemize}
\\end{itemize}
\\end{itemize}

\\begin{enumerate}
\\item Нэг
\\end{enumerate}

\\begin{description}
\\item[Нэр] Тайлбар
\\end{description}

\\begin{tabular}{|l|c|r|}
\\hline
А & Б & В \\\\
\\hline
\\end{tabular}

\\begin{table}[h]
\\centering
\\begin{tabular}{|l|}
\\hline
А \\\\
\\hline
\\end{tabular}
\\caption{Хүснэгт}
\\end{table}

\\begin{figure}[h]
\\centering
\\fbox{Зураг}
\\caption{Зураг}
\\end{figure}

\\begin{center}
Төвд
\\end{center}

\\begin{flushleft}
Зүүн
\\end{flushleft}

\\begin{flushright}
Баруун
\\end{flushright}

\\begin{quote}
Ишлэл.
\\end{quote}

\\begin{verbatim}
verbatim \\begin{itemize}
\\end{verbatim}

\\begin{abstract}
Хураангуй.
\\end{abstract}

\\begin{theorem}
Теорем.
\\end{theorem}

\\begin{definition}
Тодорхойлолт.
\\end{definition}

\\begin{proof}
Баталгаа.
\\end{proof}
`;

const META = `---
title: "Гарчиг $x$"
subtitle: "Дэд гарчиг"
author: "Зохиогч"
institute: "Байгууллага"
date: "2026 оны 9-р сарын 28"
---

`;

const FEATURES = `
::: {.center}
**Төвд тод**
:::

::: {.signature}
Өргөдөл гаргасан: Бат\\
Гарын үсэг: ________________
:::

::: {.right}
Баруун мөр
:::

::: {.left}
Зүүн мөр
:::

$\\mathbb{R}$, $\\mathcal{A}$, $\\mathfrak{g}$, ≈ ≤ ≥ ≠ ± × → ∞ ° € • ✓

::: notes
Илтгэгчийн **тэмдэглэл** $x^2$.
:::

:::::: {.columns}
::: {.column width="40%"}
Нэгдүгээр багана
:::
::: {.column width="60%"}
- Хоёрдугаар багана
:::
::::::

| Урт багана | Тоо |
| ---------- | --: |
| урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг урт үг  | 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345  |

## Дугааргүй {.unnumbered}

Сүүлийн догол.
`;

const SHAPES = String.raw`
\begin{center}
\textbf{тод} \textit{налуу} \textbf{\textit{тод налуу}} \textsl{хазгай}
\textsc{Жижиг Том} \texttt{код \textbf{тод} \textit{налуу}}
\textsf{Sans \textbf{тод} \textit{налуу} \textbf{\textit{хоёул}}}
\emph{онцлох} \footnote{Зүүлт.} \today
\end{center}
\begin{flushleft}
{\tiny а $x_i^2 \sum$}{\scriptsize а $x_i^2 \sum$}
{\footnotesize а $x_i^2 \sum$}{\small а $x_i^2 \sum$}
{\normalsize а $x_i^2 \sum$}{\large а $x_i^2 \sum$}
{\Large а $x_i^2 \sum$}{\LARGE а $x_i^2 \sum$}
{\huge а $x_i^2 \sum$}{\Huge а $x_i^2 \sum$}
\end{flushleft}
`;

const SCRIPT_MATH = String.raw`a_{b_{c}}^{d^{e}} \infty^{\infty^{\infty}} -^{-^{-}}
\mathbb{R}_{\mathbb{R}_{\mathbb{R}}} \mathcal{A}_{\mathcal{A}_{\mathcal{A}}}
\mathfrak{g}_{\mathfrak{g}_{\mathfrak{g}}} \mathbf{v}_{\mathbf{v}_{\mathbf{v}}}
\boldsymbol{x\nabla\to}_{\boldsymbol{x\nabla}_{\boldsymbol{x\nabla}}}
\mathrm{d}_{\mathrm{d}_{\mathrm{d}}} \mathsf{s}_{\mathsf{s}_{\mathsf{s}}}
\mathtt{t}_{\mathtt{t}_{\mathtt{t}}} \lesssim_{\lesssim_{\lesssim}}
\square_{\square_{\square}} \sum_{\sum_{\sum}} \int_{\int}
\sqrt{x}^{\sqrt{x}^{\sqrt{x}}} \left(\frac{1}{2}\right)^{\left(\frac{1}{2}\right)}
\text{т}_{\text{т}_{\text{т}}} 1_{2_{3}} \sin_{\sin_{\sin}}
\{\}_{\{\}_{\{\}}} \langle\rangle_{\langle\rangle} \pm_{\pm_{\pm}}
\hat{a}_{\hat{a}_{\hat{a}}}`;

const SCRIPT_TEXT = String.raw`\textbf{т} \textit{т} \textbf{\textit{т}} \textsl{т}
\textsc{Тт} \texttt{т\textbf{т}\textit{т}}
\textsf{т\textbf{т}\textit{т}\textbf{\textit{т}}} \emph{т}`;

const SIZE_NAMES = String.raw`\tiny \scriptsize \footnotesize \small \normalsize
\large \Large \LARGE \huge \Huge`.split(/\s+/);

const SIZES = SIZE_NAMES.map(
  (size) =>
    "{" +
    size +
    " " +
    SCRIPT_TEXT +
    " $" +
    SCRIPT_MATH +
    "$ \\[ " +
    SCRIPT_MATH +
    " \\]}\n\n",
);

const SLIDE_SIZES = SIZE_NAMES.map(
  (size) => "{" + size + " " + SCRIPT_TEXT + " $" + SCRIPT_MATH + "$}\n",
);

const TEXT_MATH = String.raw`\ensuremath{a_{b_{c}}^{d^{e}} \approx \leq \geq \neq \pm
\times \div - \rightarrow \leftarrow \infty \sum_{\sum} \int}
\begin{tabular}{rl} а & б \\ \end{tabular}`;

const TEXT_SIZES = SIZE_NAMES.map(
  (size) => "{" + size + " " + SCRIPT_TEXT + " " + TEXT_MATH + "}\n\n",
);

const LETTER_MD = `# Тэнхимд\\
Өргөдөл гаргах нь:

Энгийн **тод**, *налуу* ≈ ≤ ≥ ≠ ± × → ° €.

| Нэр | Тоо |
| :-- | --: |
| А | 1 |

::: {.signature}
|                   |             |
| ----------------: | :---------- |
| Өргөдөл гаргасан: | Бат         |
|       Гарын үсэг: | ____        |
:::
`;

function coverage(): string[] {
  const blocks = parse(META + SAMPLE_MD + FEATURES);
  const article = toLatex(blocks).replace(
    "\\end{document}",
    SHAPES + SIZES.join("") + "\n\\end{document}",
  );
  const [meta, ...rest] = blocks;
  const deck: Block[] = [
    meta!,
    ...rest
      .filter((block) => !(block.type === "latex" && block.env === "abstract"))
      .flatMap((block): Block[] => [
        {
          type: "heading",
          depth: 2,
          children: [{ type: "text", value: "Слайд" }],
          line: 0,
        },
        block,
      ]),
  ];
  const withShapes = (tex: string): string =>
    tex.replace(
      "\\end{document}",
      "\\begin{frame}" +
        SHAPES +
        "\\end{frame}\n" +
        SLIDE_SIZES.map(
          (size) => "\\begin{frame}" + size + "\\end{frame}\n",
        ).join("") +
        "\\end{document}",
    );
  const letter = toLatex(parse(LETTER_MD)).replace(
    "\\end{document}",
    SHAPES.replace(/\$[^$]*\$/g, "") +
      TEXT_SIZES.join("") +
      "\n\\end{document}",
  );
  return [
    article,
    letter,
    withShapes(toBeamer(deck)),
    withShapes(toBeamer(deck, BEAMER_PREAMBLE, { notesScreen: true })),
  ];
}

function trimMap(map: string, fonts: ReadonlySet<string>): string {
  return (
    map
      .split("\n")
      .filter((line) => fonts.has(line.split(/\s+/, 1)[0] ?? ""))
      .join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, "src/latex.ts"))) throw new Error("wrong root");
  execFileSync("kpsewhich", ["--version"]);
  await fetchEngine();

  mkdirSync(CACHE, { recursive: true });
  const languageDat = join(CACHE, "language.dat");
  writeFileSync(languageDat, LANGUAGE_DAT);

  const format = await run("compileformat", { "language.dat": languageDat });
  if (!format.ok || !format.pdf) {
    console.error(format.log.slice(-3000));
    throw new Error("format build failed");
  }
  const fmtPath = join(CACHE, "swiftlatexpdftex.fmt");
  writeFileSync(fmtPath, format.pdf);

  const files = new Map<string, string>();
  for (const source of coverage()) {
    const result = await run(
      "compilelatex",
      { "swiftlatexpdftex.fmt": fmtPath },
      source,
    );
    if (!result.ok) {
      console.error(result.log.slice(-3000));
      throw new Error("coverage compile failed");
    }
    for (const [name, path] of result.served) files.set(name, path);
  }

  const fonts = new Set(
    [...files.keys()]
      .filter((name) => name.endsWith(".tfm"))
      .map((name) => name.slice(0, -4)),
  );
  const bundle: Record<string, Uint8Array> = {};
  for (const [name, path] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    bundle[name] =
      name === "pdftex.map"
        ? new TextEncoder().encode(trimMap(readFileSync(path, "utf8"), fonts))
        : new Uint8Array(readFileSync(path));
  }

  const zip = zipSync(bundle, { level: 9, mtime: new Date("2026-01-01") });
  const hash = createHash("sha256").update(zip).digest("hex").slice(0, 12);
  const engineJs = patchEngine(
    readFileSync(join(ENGINE, "swiftlatexpdftex.js"), "utf8"),
  );
  const engineHash = createHash("sha256")
    .update(engineJs)
    .update(readFileSync(join(ENGINE, "swiftlatexpdftex.wasm")))
    .digest("hex")
    .slice(0, 12);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, engineHash), { recursive: true });
  writeFileSync(join(OUT, "texlive-" + hash + ".zip"), zip);
  writeFileSync(join(OUT, engineHash, "swiftlatexpdftex.js"), engineJs);
  writeFileSync(
    join(OUT, engineHash, "swiftlatexpdftex.wasm"),
    readFileSync(join(ENGINE, "swiftlatexpdftex.wasm")),
  );
  writeFileSync(
    MODULE,
    `export const TEX_ENGINE = "tex/${engineHash}/swiftlatexpdftex.js";\n` +
      `export const TEX_BUNDLE = "tex/texlive-${hash}.zip";\n`,
  );

  const raw = Object.values(bundle).reduce((n, b) => n + b.length, 0);
  console.log(
    `${Object.keys(bundle).length} files, ${(raw / 1048576).toFixed(1)} MB raw, ` +
      `zip ${(zip.length / 1048576).toFixed(2)} MB`,
  );
  console.log(readdirSync(OUT).join(" "));
}

function patchEngine(js: string): string {
  const replace = (from: string, to: string): void => {
    if (js.split(from).length !== 2) throw new Error("patch anchor: " + from);
    js = js.replace(from, () => to);
  };
  const start = js.indexOf("function kpse_find_file_impl");
  const end = js.indexOf("var moduleOverrides");
  if (start < 0 || end < start) throw new Error("patch anchor: kpse");
  js =
    js.slice(0, start) +
    'const KPSE_EXT={3:".tfm",10:".fmt",11:".map",26:".tex",32:".pfb",33:".vf",44:".enc"};' +
    "function kpse_find_file_impl(nameptr,format,_mustexist){" +
    'const reqname=UTF8ToString(nameptr);if(reqname.includes("/")){return 0}' +
    "const ext=KPSE_EXT[format];" +
    "const names=ext&&!reqname.endsWith(ext)?[reqname,reqname+ext]:[reqname];" +
    'for(const name of names){const path=TEXCACHEROOT+"/"+name;' +
    'if(FS.analyzePath(path).exists){return allocate(intArrayFromString(path),"i8",ALLOC_NORMAL)}}' +
    "return 0}" +
    "function kpse_find_pk_impl(nameptr,dpi){return 0}" +
    js.slice(end);
  replace(
    'self.texlive_endpoint="https://texlive2.swiftlatex.com/"',
    'self.texlive_endpoint=""',
  );
  replace(
    'else if(cmd==="flushcache"){cleanDir(WORKROOT)}',
    'else if(cmd==="flushcache"){cleanDir(WORKROOT)}' +
      'else if(cmd==="writetex"){FS.writeFile(TEXCACHEROOT+"/"+data["name"],data["src"])}',
  );
  return js;
}

await main();
