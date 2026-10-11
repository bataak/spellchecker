import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceRange } from "../src/editortext.ts";

interface FakeEditor {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  setSelectionRange(start: number, end: number): void;
  setRangeText(text: string, start: number, end: number, mode: string): void;
}

function fakeEditor(value: string): FakeEditor {
  return {
    value,
    selectionStart: 0,
    selectionEnd: 0,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    },
  };
}

function withExecCommand(
  impl: ((cmd: string, text?: string) => boolean) | "throw",
  run: () => void,
): string[] {
  const calls: string[] = [];
  const saved = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    execCommand(cmd: string, _ui: boolean, text?: string): boolean {
      calls.push(text === undefined ? cmd : cmd + ":" + text);
      if (impl === "throw") throw new Error("unsupported");
      return impl(cmd, text);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { document?: unknown }).document = saved;
  }
  return calls;
}

function nativeEdit(editor: FakeEditor) {
  return (cmd: string, text?: string): boolean => {
    editor.setRangeText(
      cmd === "delete" ? "" : (text ?? ""),
      editor.selectionStart,
      editor.selectionEnd,
      "end",
    );
    return true;
  };
}

const asArea = (e: FakeEditor) => e as unknown as HTMLTextAreaElement;

test("insertText-ээр сольж, undo хадгалагдсаныг буцаана", () => {
  const editor = fakeEditor("abcdef");
  let ok = false;
  const calls = withExecCommand(nativeEdit(editor), () => {
    ok = replaceRange(asArea(editor), 2, 4, "XY");
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ["insertText:XY"]);
  assert.equal(editor.value, "abXYef");
});

test("хоосон текстэд delete командыг ашиглана", () => {
  const editor = fakeEditor("abcdef");
  const calls = withExecCommand(nativeEdit(editor), () => {
    replaceRange(asArea(editor), 1, 3, "");
  });
  assert.deepEqual(calls, ["delete"]);
  assert.equal(editor.value, "adef");
});

test("хоосон мужид юу ч устгахгүй", () => {
  const editor = fakeEditor("abc");
  let ok = false;
  const calls = withExecCommand(nativeEdit(editor), () => {
    ok = replaceRange(asArea(editor), 1, 1, "");
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, []);
  assert.equal(editor.value, "abc");
});

test("execCommand ажиллахгүй бол setRangeText-ээр солино", () => {
  for (const impl of [() => false, "throw"] as const) {
    const editor = fakeEditor("hello world");
    let ok = true;
    withExecCommand(impl, () => {
      ok = replaceRange(asArea(editor), 6, 11, "there");
    });
    assert.equal(ok, false);
    assert.equal(editor.value, "hello there");
    assert.equal(editor.selectionStart, 11);
  }
});
