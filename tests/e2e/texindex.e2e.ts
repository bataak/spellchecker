import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startApp, type App } from "./harness.ts";

let app: App;

before(async () => {
  app = await startApp();
});

after(() => app.close());

const SOURCE = [
  "\\documentclass{article}",
  "\\usepackage[T2A]{fontenc}",
  "\\usepackage{makeidx}",
  "\\makeindex",
  "\\begin{document}",
  "Өвөл\\index{өвөл} ба ой\\index{ой}, ёс\\index{ёс}, ес\\index{ес}.",
  "\\newpage",
  "Дахин өвөл\\index{өвөл}.",
  "\\printindex",
  "\\end{document}",
].join("\n");

test("\\makeindex-тэй баримтад монгол цагаан толгойн дарааллаар индекс гарна", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  const text = await page.evaluate(async (source) => {
    const load = (path: string) => import(new URL(path, location.href).href);
    const { compileTex } = await load("src/tex/texpdf.ts");
    const { extractPdfText } = await load("src/preview/pdftext.ts");
    const pdf = await compileTex(source);
    return extractPdfText(
      new File([pdf], "a.pdf", { type: "application/pdf" }),
    );
  }, SOURCE);
  const index = text.slice(text.lastIndexOf("Index"));
  const order = ["ес, 1", "ёс, 1", "ой, 1", "өвөл, 1, 2"].map((entry) =>
    index.indexOf(entry),
  );
  assert.ok(
    order.every((at) => at > 0),
    index,
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  await context.close();
});
