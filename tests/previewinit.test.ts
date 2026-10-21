import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<main><div class="editor-wrap"><textarea id="ed"></textarea></div></main>',
);
Object.assign(dom.window, {
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
Object.assign(globalThis, {
  ResizeObserver: class {
    observe(): void {}
    disconnect(): void {}
  },
});

const { initPreview } = await import("../src/preview/preview.ts");

test.after(() => dom.close());

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function setup(text: string) {
  resetStorage();
  const wrap = document.querySelector<HTMLElement>(".editor-wrap")!;
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  area.value = text;
  const preview = initPreview({
    wrap,
    area,
    onFormat: () => {},
    isLatex: () => false,
    projectKey: () => null,
    inProject: () => false,
    texProject: () => null,
    pdfName: () => "a.pdf",
    jump: () => {},
    notify: () => {},
  });
  const panel = document.querySelector<HTMLElement>(".preview-panel")!;
  const body = panel.querySelector<HTMLElement>(".preview-body")!;
  return { area, preview, panel, body };
}

test("preview: markdown-ийг зурж, бичихэд шинэчилж, устгахад самбарыг авна", async () => {
  const { area, preview, panel, body } = setup("# Гарчиг\n\nТекст");
  await frame();
  assert.equal(body.querySelector("h1")!.textContent, "Гарчиг");
  area.value = "## Шинэ";
  area.dispatchEvent(new Event("input"));
  await frame();
  assert.equal(body.querySelector("h2")!.textContent, "Шинэ");
  preview.setFileName("notes.md");
  preview.setMarkdownMode(true);
  preview.setMarkdownMode(true);
  preview.revealAt(0);
  await frame();
  assert.ok(body.querySelector("h2"));
  preview.destroy();
  assert.equal(panel.isConnected, false);
});

test("preview: эх файл харуулж, бичвэр өөрчлөгдөхөд буцаад markdown болно", async () => {
  const { area, preview, panel, body } = setup("Анхны бичвэр");
  preview.setSource({ kind: "office", name: "a.docx" });
  const title = panel.querySelector(".preview-title")!;
  assert.equal(title.textContent, "Харагдац · a.docx");
  assert.equal(body.textContent, "Уг файлыг үзүүлэх боломжгүй");
  assert.equal(panel.classList.contains("is-blank"), true);
  preview.update();
  assert.equal(title.textContent, "Харагдац · a.docx");
  area.value = "Огт өөр бичвэр";
  area.dispatchEvent(new Event("input"));
  assert.equal(title.textContent, "Харагдац");
  await frame();
  assert.equal(body.querySelector("p")!.textContent, "Огт өөр бичвэр");
  preview.setSource(null);
  preview.destroy();
});
