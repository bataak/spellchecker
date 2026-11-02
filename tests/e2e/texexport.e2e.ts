import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startApp, type App } from "./harness.ts";

let app: App;

before(async () => {
  app = await startApp();
});

after(() => app.close());

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

interface Probe {
  readonly markdown?: string;
  readonly slides?: string;
  readonly tex?: string;
  readonly project?: string;
}

async function pdfText(probe: Probe): Promise<string> {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  const text = await page.evaluate(
    async ({ probe, png }) => {
      const load = (path: string) => import(new URL(path, location.href).href);
      const { compileTex } = await load("src/tex/texpdf.ts");
      const { extractPdfText } = await load("src/office/pdf/pdftext.ts");
      const { toLatex, toBeamer } = await load("src/tex/latex.ts");
      const { parse } = await load("src/markdown.ts");
      const { buildProject } = await load("src/tex/projectbuild.ts");
      const source = probe.markdown
        ? toLatex(parse(probe.markdown))
        : probe.slides
          ? toBeamer(parse(probe.slides))
          : (probe.tex ?? probe.project);
      const project = probe.project
        ? {
            build: () =>
              buildProject({
                main: "main.tex",
                texts: new Map([["main.tex", probe.project]]),
                binaries: new Map([
                  ["a.png", Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
                ]),
              }),
            digest: () => Promise.resolve(null),
          }
        : null;
      const pdf = await compileTex(source, project);
      return extractPdfText(
        new File([pdf], "a.pdf", { type: "application/pdf" }),
      );
    },
    { probe, png: PNG },
  );
  await context.close();
  return text.replace(/\s+/g, " ");
}

test('Markdown-ын " тэмдэгтийн дараах зай, зураас алдагдахгүй', async () => {
  const text = await pdfText({ markdown: 'Энэ "тест" гэж "-x хэлэв.\n' });
  assert.match(text, /"тест" гэж/);
  assert.match(text, /"-x/);
});

test("[ -ээр эхэлсэн мөр, хүснэгтийн нүдтэй Markdown PDF болно", async () => {
  const text = await pdfText({
    markdown:
      "Эхний  \n[1] дараагийн\n\n| а | б |\n|---|---|\n| в | г |\n| [2] | д |\n",
  });
  assert.match(text, /\[1\] дараагийн/);
  assert.match(text, /\[2\]/);
});

test("багана, ишлэл доторх код блоктой слайд PDF болно", async () => {
  const text = await pdfText({
    slides:
      "## Нэг\n\n::: {.columns}\n::: {.column}\n```\nкод1\n```\n:::\n:::\n\n## Хоёр\n\n> ```\n> код2\n> ```\n",
  });
  assert.match(text, /код1/);
  assert.match(text, /код2/);
});

test("хэд хэдэн хуудас эзэлдэг агуулгын дугаар бодит хуудастай таарна", async () => {
  const sections = Array.from(
    { length: 70 },
    (_, i) => `\\section{Бүлэг ${i + 1}}\nТекст ${i + 1}.\n`,
  ).join("");
  const text = await pdfText({
    tex:
      "\\documentclass[a4paper]{article}\n\\usepackage[T2A]{fontenc}\n\\begin{document}\n\\tableofcontents\n\\newpage\n" +
      sections +
      "\\end{document}\n",
  });
  assert.match(text, /1 Бүлэг 1 4 /);
});

test("төсөлд макроны аргументаар өгсөн зураг жинхэнэ зураг болно", async () => {
  const text = await pdfText({
    project:
      "\\documentclass{article}\n\\usepackage{graphicx}\n\\newcommand{\\fig}[1]{\\includegraphics{#1}}\n\\begin{document}\nАА \\fig{a.png} ББ\n\\end{document}\n",
  });
  assert.match(text, /АА ББ/);
  assert.doesNotMatch(text, /a\.png/);
});

test('индексийн \\" бүхий үг PDF-ийг унагахгүй', async () => {
  const text = await pdfText({
    tex: '\\documentclass{article}\n\\usepackage{makeidx}\n\\makeindex\n\\begin{document}\nТекст\\index{M\\"obius}\\index{a"!b}.\n\\printindex\n\\end{document}\n',
  });
  assert.match(text, /bius, 1/);
  assert.match(text, /a!b, 1/);
});

test("verbatim доторх \\includegraphics бичвэр хэвээр гарна", async () => {
  const text = await pdfText({
    tex: "\\documentclass{article}\n\\begin{document}\n\\begin{verbatim}\n\\includegraphics{zz.png}\n\\end{verbatim}\n\\end{document}\n",
  });
  assert.match(text, /\\includegraphics\{zz\.png\}/);
  assert.doesNotMatch(text, /fbox/);
});

test("жагсаалт доторх дугаартай жагсаалт өгсөн дугаараас эхэлнэ", async () => {
  const text = await pdfText({ markdown: "- нэг\n  5. тав\n  6. зургаа\n" });
  assert.match(text, /5\. тав/);
  assert.match(text, /6\. зургаа/);
});

test("\\bibitem-тэй лавлагаа дугаараа авна", async () => {
  const text = await pdfText({
    tex: "\\documentclass{article}\n\\begin{document}\n\\nocite{x}Үз \\cite{k}.\n\\begin{thebibliography}{1}\n\\bibitem{k} Ном.\n\\end{thebibliography}\n\\end{document}\n",
  });
  assert.match(text, /Үз \[1\]/);
});

test("гараар бичсэн fragile слайдын кирилл код зөв гарна", async () => {
  const text = await pdfText({
    tex: "\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}[fragile]\n\\begin{verbatim}\nкод\n\\end{verbatim}\n\\end{frame}\n\\end{document}\n",
  });
  assert.match(text, /код/);
  assert.doesNotMatch(text, /\^\^/);
});

test("тэмдэглэл доторх код блоктой слайд PDF болно", async () => {
  const text = await pdfText({
    slides: "## Нэг\n\nбичвэр\n\n::: notes\n```\nкод\n```\n:::\n",
  });
  assert.match(text, /бичвэр/);
});

test("нэг файлд макроны аргументаар өгсөн зураг орж, дутуу нь хайрцаг болно", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  const text = await page.evaluate(async (png) => {
    const load = (path: string) => import(new URL(path, location.href).href);
    const { compileTex } = await load("src/tex/texpdf.ts");
    const { extractPdfText } = await load("src/office/pdf/pdftext.ts");
    const { initTexImageInput } = await load("src/tex/teximages.ts");
    const editor = document.createElement("textarea");
    initTexImageInput({ editor, active: () => true });
    const file = new File(
      [Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
      "a.png",
      { type: "image/png" },
    );
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
    editor.dispatchEvent(event);
    const pdf = await compileTex(
      "\\documentclass{article}\n\\usepackage{graphicx}\n\\newcommand{\\fig}[1]{\\includegraphics{#1}}\n\\begin{document}\nАА \\fig{a.png} ББ \\fig{zz.png} ВВ\n\\end{document}\n",
    );
    return extractPdfText(
      new File([pdf], "a.pdf", { type: "application/pdf" }),
    );
  }, PNG);
  await context.close();
  const flat = text.replace(/\s+/g, " ");
  assert.match(flat, /АА ББ zz\.png ВВ/);
  assert.doesNotMatch(flat, /a\.png/);
});

test("нэг файлд PDF зураг хайрцаг биш, зураг болж орно", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  const text = await page.evaluate(async () => {
    const load = (path: string) => import(new URL(path, location.href).href);
    const { compileTexDocument } = await load("src/tex/texpdf.ts");
    const { extractPdfText } = await load("src/office/pdf/pdftext.ts");
    const { initTexImageInput } = await load("src/tex/teximages.ts");
    const inner = await compileTexDocument(
      "\\documentclass{article}\n\\begin{document}\nДОТОР\n\\end{document}\n",
    );
    const editor = document.createElement("textarea");
    initTexImageInput({ editor, active: () => true });
    const file = new File([inner.pdf], "vec.pdf", { type: "image/png" });
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
    editor.dispatchEvent(event);
    const outer = await compileTexDocument(
      "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nГАДНА \\includegraphics[width=5cm]{vec.pdf}\n\\end{document}\n",
    );
    return (
      outer.missing.join(",") +
      "|" +
      (await extractPdfText(
        new File([outer.pdf], "a.pdf", { type: "application/pdf" }),
      ))
    );
  });
  await context.close();
  assert.match(text, /^\|/);
  assert.match(text, /ГАДНА/);
  assert.match(text, /ДОТОР/);
  assert.doesNotMatch(text, /vec\.pdf/);
});

test("цэсний теорем, бүлэг, товъёг бүтэн биш баримтад PDF болно", async () => {
  for (const [tex, want] of [
    ["\\begin{lemma}\nүг1\n\\end{lemma}", /Лемм 1.*үг1/],
    ["\\begin{example}\nүг2\n\\end{example}", /Жишээ 1.*үг2/],
    ["\\begin{remark}\nүг3\n\\end{remark}", /Тайлбар 1.*үг3/],
    ["\\chapter{Гарчиг}\nүг4", /Гарчиг.*үг4/],
    ["үг5\\index{нэр}\n\\printindex", /нэр, 1/],
  ] as const) {
    assert.match(await pdfText({ tex }), want);
  }
});

test("цэсний нэмсэн багц, теоремтой бүтэн баримт PDF болно", async () => {
  const text = await pdfText({
    tex: "\\documentclass{article}\n\\usepackage[T2A]{fontenc}\n\\usepackage{amsthm}\n\\theoremstyle{plain}\n\\newtheorem{lemma}{Лемм}\n\\theoremstyle{remark}\n\\newtheorem{remark}{Тайлбар}\n\\usepackage{makeidx}\n\\makeindex\n\\begin{document}\n\\begin{lemma}\nа\n\\end{lemma}\n\\begin{remark}\nб\\index{в}\n\\end{remark}\n\\printindex\n\\end{document}\n",
  });
  assert.match(text, /Лемм 1/);
  assert.match(text, /Тайлбар 1/);
  assert.match(text, /в, 1/);
});

test("өөрийн amsthm-тэй бүтэн биш баримтын теорем PDF болно", async () => {
  const text = await pdfText({
    tex: "\\usepackage{amsthm}\n\\begin{document}\n\\begin{theorem}\nүг\n\\end{theorem}\n",
  });
  assert.match(text, /Теорем 1.*үг/);
});

test("\\url-ын % дараах зураг мөн мөрөнд PDF-д орно", async () => {
  const text = await pdfText({
    project:
      "\\documentclass{article}\n\\usepackage{graphicx,url}\n\\begin{document}\nАА \\url{x%20y} \\includegraphics{a.png} ББ\n\\end{document}\n",
  });
  assert.match(text, /АА x%20y ББ/);
  assert.doesNotMatch(text, /a\.png/);
});

test("SVG-ийн foreignObject, windows-1251, UTF-16 бичвэр PDF-д орно", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  const out = await page.evaluate(async () => {
    const load = (path: string) => import(new URL(path, location.href).href);
    const { renderSvg } = await load("src/tex/svgpdf.ts");
    const { extractPdfText } = await load("src/office/pdf/pdftext.ts");
    const NS = 'xmlns="http://www.w3.org/2000/svg" width="200" height="60"';
    const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
    const read = async (bytes: Uint8Array): Promise<string> => {
      const pdf = await renderSvg(bytes);
      return extractPdfText(
        new File([pdf], "a.pdf", { type: "application/pdf" }),
      );
    };
    const encode = (text: string) => new TextEncoder().encode(text);
    return [
      await read(
        encode(
          `<svg ${NS}><foreignObject x="5" y="5" width="190" height="50"><div xmlns="http://www.w3.org/1999/xhtml">Монгол</div></foreignObject></svg>`,
        ),
      ),
      await read(
        encode(
          `<svg ${NS}><switch><foreignObject width="9" height="9"><div xmlns="http://www.w3.org/1999/xhtml">Дотор</div></foreignObject><text x="5" y="20">Нөөц</text></switch></svg>`,
        ),
      ),
      await read(
        Uint8Array.from([
          ...ascii(
            `<?xml version="1.0" encoding="windows-1251"?><svg ${NS}><text x="5" y="20">`,
          ),
          0xcc,
          0xee,
          0xed,
          ...ascii("</text></svg>"),
        ]),
      ),
      await read(
        Uint8Array.from([
          0xff,
          0xfe,
          ...[...`<svg ${NS}><text x="5" y="20">Үг</text></svg>`].flatMap(
            (c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8],
          ),
        ]),
      ),
    ];
  });
  await context.close();
  assert.match(out[0]!, /Монгол/);
  assert.match(out[1]!, /Нөөц/);
  assert.match(out[2]!, /Мон/);
  assert.match(out[3]!, /Үг/);
});
