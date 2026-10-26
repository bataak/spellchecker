import { strict as assert } from "node:assert";
import { test } from "node:test";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const { closestTarget, element, eventElement, eventNode, listStep } =
  await import("../src/ui/dom.ts");

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

test("eventElement: зөвхөн элемент target-ийг буцааж, closest-ийг аюулгүй хайна", () => {
  const button = element("button", "md-btn");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  button.append(icon);
  document.body.append(button);
  let seen: Event | null = null;
  button.addEventListener("click", (event) => (seen = event));
  icon.dispatchEvent(new Event("click", { bubbles: true }));
  assert.equal(eventElement(seen!), icon);
  assert.equal(closestTarget(seen!, ".md-btn"), button);
  assert.equal(closestTarget(seen!, ".none"), null);
  const bare = new Event("x");
  assert.equal(eventElement(bare), null);
  assert.equal(eventNode(bare), null);
  button.remove();
});
