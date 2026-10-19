import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeDropped,
  composeTypedWord,
  onSwap,
  swapOrigin,
  swapText,
  pasteComposed,
  replaceRange,
} from "../src/editor/editortext.ts";

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

function pasteEvent(text: string, files = 0) {
  return {
    defaultPrevented: false,
    clipboardData: { files: { length: files }, getData: () => text },
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

const asPaste = (e: ReturnType<typeof pasteEvent>) =>
  e as unknown as ClipboardEvent;

test("задарсан й, ё-г нийлмэл болгож буулгана", () => {
  const editor = fakeEditor("[]");
  editor.setSelectionRange(1, 1);
  const event = pasteEvent("Сайхан байна. Ёс".normalize("NFD"));
  let handled = false;
  const calls = withExecCommand(nativeEdit(editor), () => {
    handled = pasteComposed(asArea(editor), asPaste(event));
  });
  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls, ["insertText:Сайхан байна. Ёс"]);
  assert.equal(editor.value, "[Сайхан байна. Ёс]");
});

test("нийлмэл бичвэр болон зурагт хөтчийн буулгалтыг үлдээнэ", () => {
  for (const event of [
    pasteEvent("Сайхан байна"),
    pasteEvent("байна".normalize("NFD"), 1),
  ]) {
    const editor = fakeEditor("");
    let handled = true;
    const calls = withExecCommand(nativeEdit(editor), () => {
      handled = pasteComposed(asArea(editor), asPaste(event));
    });
    assert.equal(handled, false);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(calls, []);
  }
});

test("засварлагч зөвхөн уншихад бол буулгалтад хүрэхгүй", () => {
  const editor = Object.assign(fakeEditor(""), { readOnly: true });
  const event = pasteEvent("байна".normalize("NFD"));
  let handled = true;
  const calls = withExecCommand(nativeEdit(editor), () => {
    handled = pasteComposed(asArea(editor), asPaste(event));
  });
  assert.equal(handled, false);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(calls, []);
  assert.equal(editor.value, "");
});

function typed(inputType: string, data: string | null) {
  return { inputType, data, isComposing: false } as unknown as InputEvent;
}

function typeAtEnd(text: string, inputType: string, data: string | null) {
  const editor = Object.assign(fakeEditor(text), { readOnly: false });
  editor.setSelectionRange(text.length, text.length);
  let handled = false;
  withExecCommand(nativeEdit(editor), () => {
    handled = composeTypedWord(asArea(editor), typed(inputType, data));
  });
  return { editor, handled };
}

test("зай авахад өмнөх үгийн задарсан й, ё нийлнэ", () => {
  const nfd = "Сайн байна".normalize("NFD");
  const { editor, handled } = typeAtEnd(nfd + " ", "insertText", " ");
  assert.equal(handled, true);
  assert.equal(editor.value, "Сайн байна ");
  assert.equal(editor.selectionStart, editor.value.length);
});

test("мөр шилжүүлэх, цэг таслалд ч нийлнэ", () => {
  const word = "Ёс".normalize("NFD");
  assert.equal(
    typeAtEnd(word + "\n", "insertLineBreak", null).editor.value,
    "Ёс\n",
  );
  assert.equal(typeAtEnd(word + ".", "insertText", ".").editor.value, "Ёс.");
});

test("нийлмэл үг, үсэг шивэх, IME, readOnly үед хөндөхгүй", () => {
  assert.equal(typeAtEnd("байна ", "insertText", " ").handled, false);
  const nfd = "байн".normalize("NFD");
  assert.equal(typeAtEnd(nfd + "а", "insertText", "а").handled, false);
  const editor = Object.assign(fakeEditor(nfd + " "), { readOnly: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
  assert.equal(
    composeTypedWord(asArea(editor), typed("insertText", " ")),
    false,
  );
  const ime = Object.assign(fakeEditor(nfd + " "), { readOnly: false });
  ime.setSelectionRange(ime.value.length, ime.value.length);
  assert.equal(
    composeTypedWord(asArea(ime), {
      inputType: "insertText",
      data: " ",
      isComposing: true,
    } as unknown as InputEvent),
    false,
  );
  assert.equal(
    typeAtEnd(nfd + " ", "insertFromPaste", nfd + " ").handled,
    false,
  );
});

test("чирж оруулсан задарсан бичвэрийг нийлүүлнэ", () => {
  const nfd = "Сайн байна".normalize("NFD");
  const editor = Object.assign(fakeEditor("[" + nfd + "]"), {
    readOnly: false,
  });
  editor.setSelectionRange(1, 1 + nfd.length);
  let handled = false;
  withExecCommand(nativeEdit(editor), () => {
    handled = composeDropped(asArea(editor), typed("insertFromDrop", null));
  });
  assert.equal(handled, true);
  assert.equal(editor.value, "[Сайн байна]");
  assert.deepEqual([editor.selectionStart, editor.selectionEnd], [1, 11]);
});

test("swapText: hook өмнө нь дуудагдаж, эх үүсвэр event-ээр дамжина", () => {
  const saved = (globalThis as { InputEvent?: unknown }).InputEvent;
  (globalThis as { InputEvent?: unknown }).InputEvent = class extends Event {
    readonly inputType: string;
    constructor(type: string, init: { inputType?: string } = {}) {
      super(type);
      this.inputType = init.inputType ?? "";
    }
  };
  try {
    const editor = Object.assign(fakeEditor("хуучин"), {
      events: [] as Event[],
      dispatchEvent(event: Event) {
        this.events.push(event);
        return true;
      },
    });
    const seen: string[] = [];
    const off = onSwap((origin) => seen.push(origin + ":" + editor.value));
    swapText(asArea(editor), "шинэ", { origin: "project", start: 1 });
    swapText(asArea(editor), "дахин", { origin: "office", notify: false });
    off();
    assert.deepEqual(seen, ["project:хуучин", "office:шинэ"]);
    assert.equal(editor.value, "дахин");
    assert.equal(editor.events.length, 1);
    assert.equal(swapOrigin(editor.events[0]!), "project");
    assert.equal(swapOrigin(new Event("input")), null);
    assert.equal(editor.selectionStart, 1);
  } finally {
    (globalThis as { InputEvent?: unknown }).InputEvent = saved;
  }
});

test("кирилл үгэн дэх ижил дүрстэй ё, ө, ү үсгийг зай авахад сольно", () => {
  const { editor, handled } = typeAtEnd("\u00EBс ", "insertText", " ");
  assert.equal(handled, true);
  assert.equal(editor.value, "ёс ");
  assert.equal(typeAtEnd("\u0473р ", "insertText", " ").editor.value, "өр ");
  assert.equal(typeAtEnd("\u019Fвс ", "insertText", " ").editor.value, "Өвс ");
  assert.equal(typeAtEnd("\u028Fс ", "insertText", " ").editor.value, "үс ");
  assert.equal(typeAtEnd("Yнэн ", "insertText", " ").editor.value, "Үнэн ");
});

test("буулгасан бичвэрийн ижил дүрстэй үсгийг сольно", () => {
  const editor = Object.assign(fakeEditor(""), { readOnly: false });
  const event = pasteEvent("\u0472\u028Fр hope");
  let handled = false;
  withExecCommand(nativeEdit(editor), () => {
    handled = pasteComposed(asArea(editor), asPaste(event));
  });
  assert.equal(handled, true);
  assert.equal(editor.value, "Өүр hope");
});

test("бусад үсэг, латин үг, холимог нэрийг хөндөхгүй", () => {
  assert.equal(typeAtEnd("үeэр ", "insertText", " ").handled, false);
  assert.equal(typeAtEnd("\u04B1с ", "insertText", " ").handled, false);
  assert.equal(typeAtEnd("ünэн ", "insertText", " ").handled, false);
  assert.equal(typeAtEnd("Yes ", "insertText", " ").handled, false);
  assert.equal(typeAtEnd("YouTube-ийн ", "insertText", " ").handled, false);
  assert.equal(typeAtEnd("\u0275 ", "insertText", " ").handled, false);
});
