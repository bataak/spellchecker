import test from "node:test";
import assert from "node:assert/strict";

import type { CommandId, Commands } from "../src/ui/commands.ts";
import { initShortcuts } from "../src/ui/shortcuts.ts";

interface Press {
  readonly key: string;
  readonly code?: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

interface Harness {
  readonly calls: string[];
  readonly hints: Map<CommandId, string>;
  readonly editor: FakeEditor;
  readonly press: (p: Press) => boolean;
}

interface FakeEditor {
  tagName: string;
  selectionStart: number;
  selectionEnd: number;
  focused: boolean;
  focus(): void;
  setSelectionRange(start: number, end: number): void;
}

const globals = globalThis as unknown as {
  document: { activeElement: unknown };
  window: Record<string, unknown>;
};

function setup(
  options: {
    mac?: boolean;
    desktop?: boolean;
    active?: "editor" | "input" | null;
    picker?: boolean;
    pageSelection?: string;
  } = {},
): Harness {
  const calls: string[] = [];
  const hints = new Map<CommandId, string>();
  const commands: Commands = {
    run: (id, shift) => calls.push("run:" + id + (shift ? "+shift" : "")),
    click: (id) => calls.push("click:" + id),
    flash: (id) => calls.push("flash:" + id),
    hint: (id, combo) => hints.set(id, combo),
  };
  const editor: FakeEditor = {
    tagName: "TEXTAREA",
    selectionStart: 0,
    selectionEnd: 0,
    focused: false,
    focus() {
      this.focused = true;
      globals.document.activeElement = this;
    },
    setSelectionRange(start, end) {
      calls.push(`select:${start}-${end}`);
    },
  };
  const active =
    options.active === "editor"
      ? editor
      : options.active === "input"
        ? { tagName: "INPUT" }
        : null;
  globals.document = { activeElement: active };
  globals.window = {
    getSelection: () => ({ toString: () => options.pageSelection ?? "" }),
    ...(options.picker === false ? {} : { showOpenFilePicker: () => null }),
  };
  let handler: ((e: unknown) => void) | null = null;
  initShortcuts({
    editor: editor as unknown as HTMLTextAreaElement,
    commands,
    wipe: () => calls.push("wipe"),
    openDictMenu: () => calls.push("dictMenu"),
    lastCaret: () => ({ start: 2, end: 5 }),
    platform: { desktop: options.desktop ?? true, mac: options.mac ?? false },
    target: {
      addEventListener: (_type: string, fn: (e: unknown) => void) => {
        handler = fn;
      },
    } as unknown as EventTarget,
  });
  const press = (p: Press): boolean => {
    let prevented = false;
    handler?.({
      key: p.key,
      code: p.code ?? "",
      ctrlKey: p.ctrl ?? false,
      metaKey: p.meta ?? false,
      shiftKey: p.shift ?? false,
      altKey: p.alt ?? false,
      preventDefault: () => {
        prevented = true;
      },
    });
    return prevented;
  };
  return { calls, hints, editor, press };
}

test("shortcuts: Ctrl+товч командыг ажиллуулна", () => {
  const h = setup();
  assert.ok(h.press({ key: "s", ctrl: true }));
  assert.ok(h.press({ key: "=", ctrl: true }));
  assert.ok(h.press({ key: "-", ctrl: true }));
  assert.ok(h.press({ key: "0", ctrl: true }));
  assert.ok(h.press({ key: "e", ctrl: true }));
  assert.ok(h.press({ key: "D", ctrl: true, shift: true }));
  assert.ok(h.press({ key: "Backspace", ctrl: true, shift: true }));
  assert.deepEqual(h.calls, [
    "run:save",
    "run:fontInc",
    "run:fontDec",
    "run:fontReset",
    "run:copyErrors",
    "run:theme",
    "run:clear",
  ]);
});

test("shortcuts: кирилл байрлалд e.code-оор танина", () => {
  const h = setup();
  assert.ok(h.press({ key: "ы", code: "KeyS", ctrl: true }));
  assert.ok(h.press({ key: "ё", ctrl: true }));
  assert.deepEqual(h.calls, ["run:save", "run:copy"]);
});

test("shortcuts: Mac дээр ⌘, Ctrl-ийг үл тооно", () => {
  const h = setup({ mac: true });
  assert.equal(h.press({ key: "s", ctrl: true }), false);
  assert.ok(h.press({ key: "s", meta: true }));
  assert.equal(h.press({ key: "s", meta: true, ctrl: true }), false);
  assert.deepEqual(h.calls, ["run:save"]);
  assert.equal(h.hints.get("open"), "⌘O");
});

test("shortcuts: хүрэлтийн төхөөрөмж дээр холбогдохгүй", () => {
  const h = setup({ desktop: false });
  assert.equal(h.press({ key: "s", ctrl: true }), false);
  assert.equal(h.hints.size, 0);
});

test("shortcuts: өөр талбарт зөвхөн хадгалах, устгахыг хүлээж авна", () => {
  const h = setup({ active: "input" });
  assert.ok(h.press({ key: "s", ctrl: true }));
  assert.equal(h.press({ key: "e", ctrl: true }), false);
  assert.ok(h.press({ key: "Backspace", ctrl: true, shift: true, alt: true }));
  assert.deepEqual(h.calls, ["flash:clear", "wipe"]);
});

test("shortcuts: Alt-тай бусад хослол үйлдэлгүй", () => {
  const h = setup();
  assert.equal(h.press({ key: "s", ctrl: true, alt: true }), false);
  assert.equal(h.press({ key: "Backspace", ctrl: true, alt: true }), false);
  assert.deepEqual(h.calls, []);
});

test("shortcuts: Ctrl+Shift+L толь бичгийн цэс нээнэ", () => {
  const h = setup();
  assert.ok(h.press({ key: "L", code: "KeyL", ctrl: true, shift: true }));
  assert.deepEqual(h.calls, ["dictMenu"]);
});

test("shortcuts: нээх нь picker байхгүй бол нуусан input-ыг дарна", () => {
  const withPicker = setup();
  withPicker.press({ key: "o", ctrl: true });
  assert.deepEqual(withPicker.calls, ["click:pick", "flash:open"]);
  const without = setup({ picker: false });
  without.press({ key: "o", ctrl: true });
  assert.deepEqual(without.calls, ["click:openFile", "flash:open"]);
});

test("shortcuts: буулгахад засварлагчид төвлөрч сүүлийн caret-ыг сэргээнэ", () => {
  const h = setup();
  assert.equal(h.press({ key: "v", ctrl: true }), false);
  assert.ok(h.editor.focused);
  assert.deepEqual(h.calls, ["select:2-5", "flash:paste"]);
  const focused = setup({ active: "editor" });
  focused.press({ key: "v", ctrl: true });
  assert.deepEqual(focused.calls, ["flash:paste"]);
});

test("shortcuts: сонголттой үед хуулалтыг хөтчид үлдээнэ", () => {
  const selected = setup({ pageSelection: "үг" });
  assert.equal(selected.press({ key: "c", ctrl: true }), false);
  assert.deepEqual(selected.calls, ["flash:copy"]);
  const empty = setup();
  assert.ok(empty.press({ key: "c", ctrl: true }));
  assert.deepEqual(empty.calls, ["run:copy"]);
  const link = setup({ pageSelection: "үг" });
  assert.ok(link.press({ key: "C", ctrl: true, shift: true }));
  assert.deepEqual(link.calls, ["run:copy+shift"]);
});

test("shortcuts: Ctrl+Shift+. ба Ctrl+Shift+, мөр сонгоно", () => {
  const h = setup({ active: "editor" });
  Object.assign(h.editor, {
    value: "нэг\nхоёр\nгурав\n",
    selectionStart: 5,
    selectionEnd: 5,
  });
  assert.ok(h.press({ key: "В", code: "Period", ctrl: true, shift: true }));
  assert.ok(h.press({ key: "<", code: "Comma", ctrl: true, shift: true }));
  assert.deepEqual(h.calls, ["select:4-9", "select:4-9"]);
});

test("shortcuts: засварлагч фокусгүй үед мөр сонгохгүй", () => {
  const h = setup({ active: "input" });
  h.press({ key: ">", code: "Period", ctrl: true, shift: true });
  assert.deepEqual(h.calls, []);
});
