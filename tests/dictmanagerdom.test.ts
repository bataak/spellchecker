import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({ matches: false });

const { createDictManager } = await import("../src/spellui/dictmanager.ts");

test.after(() => dom.close());

const dict = (id: string, name: string, user: boolean) => ({
  id,
  name,
  words: 1234,
  digest: "",
  user,
  latin: false,
});

test("dictManager: толинуудыг жагсааж, зөөх ба засах товчийг зөв идэвхжүүлнэ", async () => {
  const statuses: string[] = [];
  const manager = createDictManager({
    list: async () => [
      dict("a", "Суусан", false),
      dict("user:b", "Миний", true),
    ],
    reload: () => {},
    reorder: () => {},
    changed: () => {},
    status: (message) => statuses.push(message),
  });
  await manager.open();
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  assert.equal(dialog.open, true);
  const rows = [...dialog.querySelectorAll(".dict-manager-row")];
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.textContent!, /Суусан.*үгтэй · суусан/);
  assert.match(rows[1]!.textContent!, /Миний.*үгтэй$/);
  const buttons = (row: Element) => [...row.querySelectorAll("button")];
  assert.equal(buttons(rows[0]!).length, 2);
  assert.equal(buttons(rows[1]!).length, 4);
  assert.equal(buttons(rows[0]!)[0]!.disabled, true);
  assert.equal(buttons(rows[1]!)[1]!.disabled, true);
  assert.equal(
    dialog.querySelector<HTMLElement>(".dict-manager-empty")!.hidden,
    true,
  );
  assert.ok(dialog.querySelector(".dict-manager-hint"));
  const close = [...dialog.querySelectorAll("button")].find(
    (b) => b.textContent === "Хаах",
  )!;
  close.click();
  assert.equal(dialog.open, false);
  await manager.open();
  assert.equal(document.querySelectorAll("dialog").length, 1);
  assert.equal(dialog.open, true);
});

test("dictManager: файлгүй чирэлт юу ч хийхгүй, хоосон толь бол мэдэгдэнэ", async () => {
  document.body.replaceChildren();
  const statuses: string[] = [];
  const manager = createDictManager({
    list: async () => [],
    reload: () => {},
    reorder: () => {},
    changed: () => {},
    status: (message) => statuses.push(message),
  });
  await manager.open();
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  assert.equal(
    dialog.querySelector<HTMLElement>(".dict-manager-empty")!.hidden,
    false,
  );
  const drop = new Event("drop", { cancelable: true });
  dialog.dispatchEvent(drop);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(drop.defaultPrevented, true);
  assert.deepEqual(statuses, []);
});
