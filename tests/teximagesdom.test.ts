import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom();
const { onTexImagesChange, texImageFiles, texImageSources } =
  await import("../src/tex/teximages.ts");
const { initTexImageInput } = await import("../src/tex/teximageinput.ts");

test.after(() => dom.close());

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function paste(editor: HTMLTextAreaElement, files: File[]): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files } });
  editor.dispatchEvent(event);
  return event;
}

function setup(active = true) {
  const editor = document.createElement("textarea");
  document.body.appendChild(editor);
  initTexImageInput({ editor, active: () => active });
  return editor;
}

test("буулгасан зургийг includegraphics болгож оруулна", () => {
  const editor = setup();
  let heard = 0;
  const off = onTexImagesChange(() => heard++);
  const event = paste(editor, [
    new File([PNG], "my photo.png", { type: "image/png" }),
    new File(["текст"], "note.txt", { type: "text/plain" }),
  ]);
  off();
  assert.equal(event.defaultPrevented, true);
  assert.match(
    editor.value,
    /\\includegraphics\[width=\\linewidth\]\{my-photo\.png\}/,
  );
  assert.equal(heard, 1);
  const again = paste(editor, [
    new File([PNG], "my photo.png", { type: "image/png" }),
  ]);
  assert.equal(again.defaultPrevented, true);
  assert.match(editor.value, /my-photo-2\.png/);
});

test("зураггүй эсвэл идэвхгүй үед буулгалтад хөндлөнгөөс оролцохгүй", () => {
  const off = setup(false);
  assert.equal(
    paste(off, [new File([PNG], "a.png", { type: "image/png" })])
      .defaultPrevented,
    false,
  );
  const on = setup();
  assert.equal(
    paste(on, [new File(["x"], "a.txt", { type: "text/plain" })])
      .defaultPrevented,
    false,
  );
});

test("TeX хөрвүүлэхэд оруулсан зургийг engine-ийн нэрээр бэлтгэнэ", async () => {
  const editor = setup();
  paste(editor, [new File([PNG], "fig.png", { type: "image/png" })]);
  const text = editor.value + "\n\\includegraphics{missing.png}";
  const images = await texImageFiles(text);
  assert.deepEqual(Object.keys(images.files), ["image1.png"]);
  assert.deepEqual(images.missing, ["missing.png"]);
  const rewritten = images.rewrite(text);
  assert.match(rewritten, /\{image1\.png\}/);
  assert.match(rewritten, /\\fbox\{\\ttfamily\\detokenize\{missing\.png\}\}/);
});

test("pdflatex эх файлд аюулгүй замтай зургийг нэрээр нь хадгална", async () => {
  const editor = setup();
  paste(editor, [new File([PNG], "keep.png", { type: "image/png" })]);
  const text = editor.value + "\n\\includegraphics{gone}";
  const images = await texImageSources(text);
  assert.deepEqual(Object.keys(images.files), ["keep.png"]);
  assert.deepEqual(images.missing, ["gone"]);
  assert.equal(images.rewrite(text), text);
});

test("сонгосон PDF зургийг дутуу гэж үзэхгүй, өргөтгөлгүй замаар ч олно", async () => {
  const editor = setup();
  const pdf = new File([PNG], "vec.pdf", { type: "image/png" });
  paste(editor, [pdf]);
  const named = await texImageFiles(editor.value);
  assert.deepEqual(Object.keys(named.files), ["image1.pdf"]);
  assert.deepEqual(named.missing, []);
  const bare = await texImageFiles("\\includegraphics{vec}");
  assert.deepEqual(Object.keys(bare.files), ["image1.pdf"]);
  assert.deepEqual(bare.missing, []);
});

test("макроны аргументаар өгсөн зургийг нэрээр нь бэлтгэж, дутууг хайрцаглана", async () => {
  const editor = setup();
  paste(editor, [new File([PNG], "macro.png", { type: "image/png" })]);
  const text = String.raw`\newcommand{\fig}[1]{\includegraphics[width=2cm]{#1}}
\fig{macro.png} \fig{gone.png} % \fig{old.png}`;
  const images = await texImageFiles(text);
  assert.deepEqual(Object.keys(images.files), ["macro.png"]);
  assert.deepEqual(images.missing, []);
  assert.ok(
    images
      .rewrite(text)
      .includes(
        String.raw`\IfFileExists{#1}{\includegraphics[width=2cm]{#1}}{\fbox{\ttfamily\detokenize{#1}}}`,
      ),
  );
  const sources = await texImageSources(text);
  assert.deepEqual(Object.keys(sources.files), ["macro.png"]);
  assert.equal(sources.rewrite(text), text);
});
