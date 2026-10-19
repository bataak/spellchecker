import { test } from "node:test";
import assert from "node:assert/strict";
import { createDocumentSession } from "../src/docsession.ts";

const setup = () => {
  const state = {
    office: null as { name: string; output: string } | null,
    target: null as string | null,
    template: "plain",
    tex: false,
    titles: [] as [string | null, boolean][],
    refreshed: 0,
    modes: [] as boolean[],
  };
  const doc = createDocumentSession({
    office: () =>
      state.office && {
        fileName: () => state.office!.name,
        outputName: () => state.office!.output,
      },
    targetName: () => state.target,
    template: () => state.template,
    isTex: () => state.tex,
    setSaveTitles: (output, open) => state.titles.push([output, open]),
    refreshBar: () => state.refreshed++,
    enterMode: (markdown) => state.modes.push(markdown),
  });
  return { state, doc };
};

test("docsession файлгүй үед загвараар markdown эсэхийг шийднэ", () => {
  const { state, doc } = setup();
  assert.equal(doc.markdownActive(), false);
  state.template = "report";
  assert.equal(doc.markdownActive(), true);
  state.tex = true;
  assert.equal(doc.markdownActive(), false);
});

test("docsession файлын өргөтгөлөөр markdown эсэхийг шийднэ", () => {
  const { state, doc } = setup();
  state.template = "report";
  doc.setName("notes.txt");
  assert.equal(doc.markdownActive(), false);
  doc.setName("notes.MD");
  assert.equal(doc.markdownActive(), true);
  state.target = "other.txt";
  assert.equal(doc.isMarkdownFile(), false);
  assert.equal(doc.baseName(), "other.txt");
});

test("docsession Word файл нээлттэй бол түүний нэрийг хэрэглэнэ", () => {
  const { state, doc } = setup();
  doc.setName("a.md");
  state.office = { name: "b.docx", output: "b-засвар.docx" };
  assert.equal(doc.fileName(), "b.docx");
  assert.equal(doc.isMarkdownFile(), false);
  doc.syncSaveHint();
  assert.deepEqual(state.titles.at(-1), ["b-засвар.docx", true]);
});

test("docsession open нэрийг тогтоож горимд орно", () => {
  const { state, doc } = setup();
  doc.open("a.md");
  assert.equal(doc.name(), "a.md");
  assert.deepEqual(state.titles.at(-1), [null, true]);
  assert.equal(state.refreshed, 1);
  assert.deepEqual(state.modes, [true]);
  doc.setName(null);
  assert.deepEqual(state.titles.at(-1), [null, false]);
  assert.deepEqual(state.modes, [true]);
});
