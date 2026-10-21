import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<button id="owner">Нээх</button>');
const { createProjectMenu } = await import("../src/project/projectmenu.ts");

test.after(() => dom.close());

const escaped: string[] = [];
const menu = createProjectMenu(() => escaped.push("escape"));
const ran: string[] = [];
const items = [
  { label: "Файл", run: () => ran.push("file") },
  {
    label: "LaTeX төсөл",
    items: [
      { label: "Хавтас", run: () => ran.push("folder") },
      { label: "Git", run: () => ran.push("git") },
    ],
  },
];
const owner = document.querySelector<HTMLElement>("#owner")!;
const buttons = () => [
  ...menu.el.querySelectorAll<HTMLButtonElement>("button"),
];
const key = (target: Element, name: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
    }),
  );
const click = (target: Element, detail = 1) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));

test("projectMenu: Escape нь нээсэн товч уруу фокус буцааж, эзэнгүй бол onEscape дуудна", () => {
  menu.open(items, 0, 0, owner);
  assert.equal(menu.owner(), owner);
  key(buttons()[0]!, "Escape");
  assert.equal(menu.el.hidden, true);
  assert.equal(document.activeElement, owner);
  assert.equal(menu.owner(), null);
  menu.open(items, 0, 0);
  key(buttons()[0]!, "Escape");
  assert.deepEqual(escaped, ["escape"]);
});

test("projectMenu: ArrowRight бүлгийг нээж, ArrowLeft хааж гарчиг уруу буцна", () => {
  menu.open(items, 0, 0, owner);
  const [, head, folder, git] = buttons();
  assert.equal(head!.getAttribute("aria-haspopup"), "true");
  assert.equal(folder!.hidden, true);
  key(head!, "ArrowRight");
  assert.equal(head!.getAttribute("aria-expanded"), "true");
  assert.equal(folder!.hidden, false);
  assert.equal(document.activeElement, folder);
  key(git!, "ArrowLeft");
  assert.equal(head!.getAttribute("aria-expanded"), "false");
  assert.equal(git!.hidden, true);
  assert.equal(document.activeElement, head);
  menu.close();
});

test("projectMenu: бүлгийг давхар товшиход хоёр дахь товшилт шилжсэн мөрийг ажиллуулахгүй", () => {
  ran.length = 0;
  menu.open(items, 0, 0, owner);
  const [, head, , git] = buttons();
  click(head!, 1);
  assert.equal(head!.getAttribute("aria-expanded"), "true");
  click(git!, 2);
  assert.deepEqual(ran, []);
  assert.equal(menu.el.hidden, false);
  click(git!, 1);
  assert.deepEqual(ran, ["git"]);
  assert.equal(menu.el.hidden, true);
});
