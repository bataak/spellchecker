import { strict as assert } from "node:assert";
import { test } from "node:test";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const { element, listStep } = await import("../src/ui/dom.ts");

test.after(() => dom.close());

test("element: класс, текст өгсөн үед л тавина", () => {
  const button = element("button", "tbtn", "Нээх");
  assert.equal(button.className, "tbtn");
  assert.equal(button.textContent, "Нээх");
  assert.equal(element("div").hasAttribute("class"), false);
});

test("listStep: сумаар эргэлдэж, Home/End-ээр захад үсэрнэ", () => {
  assert.equal(listStep("ArrowDown", 2, 3), 0);
  assert.equal(listStep("ArrowUp", 0, 3), 2);
  assert.equal(listStep("Home", 2, 3), 0);
  assert.equal(listStep("End", 0, 3), 2);
  assert.equal(listStep("a", 0, 3), -1);
});
