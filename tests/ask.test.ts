import test from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
test.after(() => dom.close());

const { askChoice } = await import("../src/ui/ask.ts");

const dialog = (): HTMLDialogElement =>
  document.querySelector<HTMLDialogElement>(".ask-dialog")!;
const buttons = (): HTMLButtonElement[] => [
  ...dialog().querySelectorAll<HTMLButtonElement>("button"),
];

test("askChoice: асуулт, тайлбар, хоёр товчтой цонх гаргаж сонголтыг буцаана", async () => {
  const yes = askChoice({
    title: "Устгах уу?",
    text: "Буцаах боломжгүй.",
    yes: "Устгах",
    no: "Болих",
  });
  assert.equal(
    dialog().querySelector(".suggest-title")!.textContent,
    "Устгах уу?",
  );
  assert.equal(
    dialog().querySelector(".suggest-hint")!.textContent,
    "Буцаах боломжгүй.",
  );
  assert.deepEqual(
    buttons().map((node) => node.textContent),
    ["Болих", "Устгах"],
  );
  assert.equal(document.activeElement, buttons()[1]);
  buttons()[1]!.click();
  assert.equal(await yes, true);
  assert.equal(document.querySelector(".ask-dialog"), null);

  const no = askChoice({ title: "Нээх үү?", yes: "Нээх", no: "Болих" });
  buttons()[0]!.click();
  assert.equal(await no, false);
});

test("askChoice: хаагдвал эсвэл гадна дарвал «үгүй» гэж үзнэ, аюултай бол «үгүй»-д фокуслана", async () => {
  const closed = askChoice({
    title: "А?",
    yes: "Тийм",
    no: "Үгүй",
    danger: true,
  });
  assert.equal(document.activeElement, buttons()[0]);
  assert.ok(buttons()[1]!.classList.contains("collab-wipe"));
  dialog().close();
  assert.equal(await closed, false);

  const outside = askChoice({ title: "Б?", yes: "Тийм", no: "Үгүй" });
  dialog().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(await outside, false);
});
