import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<a class="suggestctl" href="#">Үг мэдэгдэх</a>');
const g = globalThis as unknown as Record<string, unknown>;
const win = dom.window as unknown as Record<string, unknown>;
win.turnstile = {
  render: () => "w1",
  reset: () => {},
  getResponse: () => "tok",
};
g.window = dom.window;
const posted: unknown[] = [];
g.fetch = async (_url: string, init: { body: string }) => {
  posted.push(JSON.parse(init.body));
  return { status: 201 };
};

const { initSuggest } = await import("../src/feedback/suggest.ts");
const { getSubmitted } = await import("../src/feedback/submitted.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

initSuggest({
  getBadTokens: () => [
    { word: "алдаатай", start: 0, end: 8 },
    { word: "буруу", start: 9, end: 14 },
  ],
  isDashSuffix: () => false,
  checkKnown: async () => null,
  suggest: async (word) => (word === "боловсролы" ? ["боловсролын"] : []),
});

const chips = () =>
  [
    ...document.querySelectorAll(
      ".suggest-chips:not(.suggest-submitted-chips) .suggest-chip",
    ),
  ].map((chip) => chip.firstChild!.textContent);

async function open(): Promise<HTMLElement> {
  document.querySelector<HTMLElement>("a.suggestctl")!.click();
  await wait();
  return document.querySelector<HTMLElement>(".suggest-overlay")!;
}

test("suggestForm: алдаатай үгсээр бөглөж, бичсэн үгийг нэмж, Backspace-аар хасна", async () => {
  resetStorage();
  const overlay = await open();
  assert.equal(overlay.hidden, false);
  assert.deepEqual(chips(), ["алдаатай", "буруу"]);
  const input = overlay.querySelector<HTMLInputElement>("#suggestWord")!;
  input.value = "шинэүг, дараа";
  input.dispatchEvent(new Event("input"));
  await wait();
  assert.deepEqual(chips(), ["алдаатай", "буруу", "шинэүг"]);
  assert.equal(input.value, "дараа");
  input.value = "";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  assert.deepEqual(chips(), ["алдаатай", "буруу"]);
  overlay.querySelector<HTMLElement>(".suggest-chip-x")!.click();
  assert.deepEqual(chips(), ["буруу"]);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(overlay.hidden, true);
});

test("suggestForm: хоосон бол илгээхгүй, үгтэй бол илгээж мэдэгдсэн үгсэд нэмнэ", async () => {
  resetStorage();
  posted.length = 0;
  const overlay = await open();
  const note = overlay.querySelector<HTMLElement>(".suggest-note")!;
  overlay.querySelector<HTMLElement>(".suggest-clear-all")!.click();
  assert.deepEqual(chips(), []);
  overlay.querySelector<HTMLElement>(".suggest-send")!.click();
  await wait();
  assert.equal(note.textContent, "Дор хаяж нэг үг оруулна уу");
  assert.equal(posted.length, 0);
  const input = overlay.querySelector<HTMLInputElement>("#suggestWord")!;
  input.value = "сайхан";
  overlay.querySelector<HTMLTextAreaElement>("#suggestNote")!.value = "тайлбар";
  overlay.querySelector<HTMLElement>(".suggest-send")!.click();
  await wait(10);
  assert.deepEqual(posted, [
    { words: ["сайхан"], note: "тайлбар", turnstileToken: "tok" },
  ]);
  assert.equal(note.textContent, "Илгээгдлээ, баярлалаа!");
  assert.deepEqual(chips(), []);
  assert.deepEqual([...getSubmitted()], ["сайхан"]);
  overlay.querySelector<HTMLElement>(".suggest-view-submitted")!.click();
  assert.match(overlay.querySelector("#suggestTitle")!.textContent!, /\(1\)/);
  await wait(1500);
  assert.equal(overlay.hidden, true);
});

test("suggestForm: алдаатай байж магадгүй үгийг эхний удаад анхааруулж, дахин дарахад илгээнэ", async () => {
  resetStorage();
  posted.length = 0;
  const overlay = await open();
  const note = overlay.querySelector<HTMLElement>(".suggest-note")!;
  overlay.querySelector<HTMLElement>(".suggest-clear-all")!.click();
  const input = overlay.querySelector<HTMLInputElement>("#suggestWord")!;
  input.value = "боловсролы";
  const send = overlay.querySelector<HTMLButtonElement>(".suggest-send")!;
  send.click();
  await wait(10);
  assert.equal(posted.length, 0);
  assert.match(note.textContent!, /«боловсролы» → «боловсролын»/);
  assert.equal(send.disabled, false);
  send.click();
  await wait(10);
  assert.deepEqual(posted, [
    { words: ["боловсролы"], note: "", turnstileToken: "tok" },
  ]);
  await wait(1500);
});
