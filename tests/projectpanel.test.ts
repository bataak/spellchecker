import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ago,
  emptyMessage,
  exportTitle,
  folderLabel,
  removeQuestion,
  replaceQuestion,
} from "../src/project/panelview.ts";
import { canMoveInto, movedPath } from "../src/project/treedrag.ts";

const MIN = 60000;

test("ago: минут, цаг, өдрөөр хэлнэ", () => {
  assert.equal(ago(0, 30000), "дөнгөж сая");
  assert.equal(ago(0, 5 * MIN), "5 минутын өмнө");
  assert.equal(ago(0, 3 * 60 * MIN), "3 цагийн өмнө");
  assert.equal(ago(0, 50 * 60 * MIN), "2 өдрийн өмнө");
});

test("exportTitle: татаагүй бол хугацаа нэмэхгүй", () => {
  assert.equal(
    exportTitle(null, 0),
    "Төслийг бүхэлд нь zip архив болгож татах",
  );
  assert.ok(
    exportTitle(0, 2 * MIN).endsWith(" · сүүлд татсан: 2 минутын өмнө"),
  );
});

test("folderLabel ба emptyMessage: нээлттэй файлаас хамаарна", () => {
  const plain = { name: "a.tex", handle: null, master: null };
  const part = { name: "ch1.tex", handle: null, master: "../main.tex" };
  assert.equal(folderLabel(null, true), "Хавтас нээх");
  assert.equal(folderLabel(part, false), "Төслийн хавтсыг нээх");
  assert.equal(
    folderLabel({ ...plain, handle: {} as FileSystemFileHandle }, true),
    "«a.tex»-ийн хавтсыг нээх",
  );
  assert.match(emptyMessage("Тезис", null), /^«Тезис» хавтсыг дахин нээх/);
  assert.match(emptyMessage(null, part), /дээд хавтсыг сонгоно уу\.$/);
  assert.match(emptyMessage(null, plain), /^LaTeX төслийг/);
});

test("removeQuestion ба replaceQuestion", () => {
  assert.equal(
    removeQuestion("img", true, true),
    "«img» хавтсыг доторх бүх файлтай нь дискнээс устгах уу?",
  );
  assert.equal(
    removeQuestion("a.tex", false, false),
    "«a.tex» файлыг устгах уу?",
  );
  assert.equal(
    replaceQuestion("a.png", true, false),
    "«a.png» файл төсөлд байна. Хадгалаагүй өөрчлөлт нь алга болно. Шинэ файлаар солих уу?",
  );
});

test("canMoveInto: өөр рүүгээ, доод хавтас руугаа, ижил хавтас руу зөөхгүй", () => {
  assert.equal(canMoveInto("img/a.png", "img"), false);
  assert.equal(canMoveInto("img", "img"), false);
  assert.equal(canMoveInto("img", "img/sub"), false);
  assert.equal(canMoveInto("img/a.png", ""), true);
  assert.equal(canMoveInto("a.tex", "chapters"), true);
  assert.equal(movedPath("img/a.png", ""), "a.png");
  assert.equal(movedPath("a.tex", "ch"), "ch/a.tex");
});
