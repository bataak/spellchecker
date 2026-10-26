import "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<button id="save">Хадгалах</button>');
const { createPdfSaver, missingNote, setSaveBusy } =
  await import("../src/export/savepdf.ts");

test.after(() => dom.close());

const button = (): HTMLElement => document.querySelector<HTMLElement>("#save")!;
const downloads: string[] = [];
dom.window.HTMLAnchorElement.prototype.click = function (
  this: HTMLAnchorElement,
) {
  downloads.push(this.download);
};

const pdf = (missing: string[] = []) =>
  Promise.resolve({
    pdf: new Uint8Array([37, 80, 68, 70]),
    missing,
  }) as never;

test("setSaveBusy: шошгыг түр сольж, буцааж сэргээнэ", () => {
  setSaveBusy(button(), true, "Түр хүлээ");
  assert.equal(button().textContent, "Түр хүлээ");
  assert.equal(button().hasAttribute("aria-busy"), true);
  setSaveBusy(button(), false);
  assert.equal(button().textContent, "Хадгалах");
  setSaveBusy(null, true);
});

test("missingNote: нэрсийг escape хийж нэгтгэнэ", () => {
  assert.equal(missingNote("Зураг: ", ["a<b>", "c"]), "Зураг: a&lt;b&gt;, c");
});

test("pdfSaver: хадгалж, ороогүй зургийг мэдэгдэнэ", async () => {
  const notes: string[] = [];
  const save = createPdfSaver({
    name: () => "бичвэр.pdf",
    saveProject: () => Promise.reject(new Error("x")),
    notify: (html) => notes.push(html),
    button: button(),
  });
  await save(() => pdf(["img.png"]));
  assert.deepEqual(downloads.splice(0), ["бичвэр.pdf"]);
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /Төслийн файлуудыг хадгалж чадсангүй/);
  assert.match(notes[0]!, /img\.png/);
});

test("pdfSaver: PdfError-ийг мэдэгдэж, давхар дуудлагыг алгасна", async () => {
  const notes: string[] = [];
  let compiles = 0;
  const save = createPdfSaver({
    name: () => "a.pdf",
    saveProject: () => undefined,
    notify: (html) => notes.push(html),
    button: button(),
  });
  const failing = () => {
    compiles++;
    const error = new Error("<bad>");
    error.name = "PdfError";
    return Promise.reject(error);
  };
  await Promise.all([save(failing), save(failing)]);
  assert.equal(compiles, 1);
  assert.deepEqual(notes, ["&lt;bad&gt;"]);
  assert.equal(button().hasAttribute("aria-busy"), false);
  assert.equal(downloads.length, 0);
});
