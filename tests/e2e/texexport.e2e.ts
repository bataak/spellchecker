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
