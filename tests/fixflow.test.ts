import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixFlow } from "../src/spell/fixflow.ts";

const original = "Сайн байнаа уу. Байнаа гэж бичлээ.";
const token = { word: "байнаа", start: 5, end: 11 };

const setup = (known = true) => {
  const editor = { value: original, selectionStart: 0, scrollTop: 40 };
  const calls = { renders: 0, commits: [] as [string, number][], cancels: 0 };
  const flow = createFixFlow({
    editor: editor as unknown as HTMLTextAreaElement,
    spell: {
      correctNow: async () => known,
      skipFor: () => [],
      plainFences: () => [],
    },
    setText: (text, caret) => {
      editor.value = text;
      editor.selectionStart = caret;
      editor.scrollTop = 0;
    },
    render: () => calls.renders++,
    commit: async (text, caret) => {
      calls.commits.push([text, caret]);
    },
    cancel: () => calls.cancels++,
  });
  return { editor, calls, flow };
};

const typeFix = (editor: { value: string; selectionStart: number }) => {
  editor.value = "Сайн байна уу. Байнаа гэж бичлээ.";
  editor.selectionStart = 10;
};

test("fixflow гараар зассан үгийг бусад давталтад тараана", async () => {
  const { editor, calls, flow } = setup();
  flow.arm(token);
  typeFix(editor);
  await flow.propagate();
  assert.equal(editor.value, "Сайн байна уу. Байна гэж бичлээ.");
  assert.equal(editor.scrollTop, 40);
  assert.equal(calls.renders, 1);
  await flow.propagate();
  assert.equal(calls.renders, 1);
});

test("fixflow drop хийсэн эсвэл буруу үгийг тараахгүй", async () => {
  const dropped = setup();
  dropped.flow.arm(token);
  dropped.flow.drop();
  typeFix(dropped.editor);
  await dropped.flow.propagate();
  assert.equal(dropped.calls.renders, 0);

  const unknown = setup(false);
  unknown.flow.arm(token);
  typeFix(unknown.editor);
  await unknown.flow.propagate();
  assert.equal(unknown.editor.value, "Сайн байна уу. Байнаа гэж бичлээ.");
});

test("fixflow apply санал болгосон үгийг commit хийнэ", async () => {
  const { calls, flow } = setup();
  await flow.apply(token, "байна");
  assert.deepEqual(calls.commits, [["Сайн байна уу. Байна гэж бичлээ.", 10]]);
  await flow.apply(token, "байнаа");
  assert.equal(calls.cancels, 1);
});
