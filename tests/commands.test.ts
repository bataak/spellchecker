import test from "node:test";
import assert from "node:assert/strict";

import { createButtonCommands } from "../src/ui/commands.ts";

class FakeButton {
  disabled = false;
  clicks = 0;
  readonly attrs = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => void this.classes.add(name),
    remove: (name: string) => void this.classes.delete(name),
  };
  click(): void {
    this.clicks += 1;
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
}

function root(buttons: Record<string, FakeButton>): ParentNode {
  return {
    querySelector: (selector: string) => buttons[selector] ?? null,
  } as unknown as ParentNode;
}

test("commands: run товчийг дарж түр тодруулна", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const save = new FakeButton();
  const commands = createButtonCommands(root({ "#saveBtn": save }));
  commands.run("save");
  assert.equal(save.clicks, 1);
  assert.ok(save.classes.has("kbd-active"));
  t.mock.timers.tick(260);
  assert.equal(save.classes.has("kbd-active"), false);
});

test("commands: идэвхгүй эсвэл байхгүй товчийг хөндөхгүй", () => {
  const save = new FakeButton();
  save.disabled = true;
  const commands = createButtonCommands(root({ "#saveBtn": save }));
  commands.run("save");
  commands.flash("save");
  commands.run("print");
  assert.equal(save.clicks, 0);
  assert.equal(save.classes.size, 0);
});

test("commands: flash дарахгүй, click тодруулахгүй", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const copy = new FakeButton();
  const file = new FakeButton();
  const commands = createButtonCommands(
    root({ "#copyBtn": copy, "#openFile": file }),
  );
  commands.flash("copy");
  commands.click("openFile");
  assert.equal(copy.clicks, 0);
  assert.ok(copy.classes.has("kbd-active"));
  assert.equal(file.clicks, 1);
  assert.equal(file.classes.size, 0);
});

test("commands: дахин тодруулахад хугацааг шинэчилнэ", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const btn = new FakeButton();
  const commands = createButtonCommands(root({ "#themeBtn": btn }));
  commands.flash("theme");
  t.mock.timers.tick(200);
  commands.flash("theme");
  t.mock.timers.tick(200);
  assert.ok(btn.classes.has("kbd-active"));
  t.mock.timers.tick(60);
  assert.equal(btn.classes.has("kbd-active"), false);
});

test("commands: hint одоогийн title-д нэмнэ", () => {
  const open = new FakeButton();
  const paste = new FakeButton();
  open.setAttribute("title", "Файл нээх");
  const commands = createButtonCommands(
    root({ "#openBtn": open, "#pasteBtn": paste }),
  );
  commands.hint("open", "Ctrl+O");
  commands.hint("paste", "Ctrl+V");
  assert.equal(open.getAttribute("title"), "Файл нээх · Ctrl+O");
  assert.equal(paste.getAttribute("title"), "Ctrl+V");
});

test("commands: дарснаар идэвхгүй болсон товчийг ч тодруулна", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = new FakeButton();
  clear.click = function (): void {
    this.clicks += 1;
    this.disabled = true;
  };
  const commands = createButtonCommands(root({ "#clearBtn": clear }));
  commands.run("clear");
  assert.equal(clear.clicks, 1);
  assert.ok(clear.classes.has("kbd-active"));
});
