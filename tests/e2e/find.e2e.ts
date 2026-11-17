import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chooseSlot, ready, startApp, type App } from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(() => app.close());

const TEXT = Array.from(
  { length: 60 },
  (_, i) => `${i}. Өвөл болж байна. Энэ өвөл хүйтэн.`,
).join("\n");

test("⌘/Ctrl+F хайж, олдцоор гүйлгэж, нэгийг ба бүгдийг солино", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  await ready(page);
  await chooseSlot(page, "Судалгаа");
  await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = text;
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.focus();
    area.setSelectionRange(0, 0);
  }, TEXT);
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  await page.keyboard.type("өвөл");
  const read = () =>
    page.evaluate(() => {
      const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
      return {
        count: document.querySelector(".find-count")!.textContent,
        selected: area.value.slice(area.selectionStart, area.selectionEnd),
        at: area.selectionStart,
        scroll: area.scrollTop,
        marks: document.querySelectorAll(".find-mark").length,
        text: area.value,
      };
    });
  let state = await read();
  assert.equal(state.count, "1/120");
  assert.equal(state.selected, "Өвөл");
  assert.ok(state.marks > 0);

  for (let i = 0; i < 82; i++) await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  state = await read();
  assert.equal(state.count, "82/120");
  assert.ok(state.scroll > 0);

  await page.fill(".find-input[placeholder='Солих']", "зун");
  await page.press(".find-input[placeholder='Солих']", "Enter");
  state = await read();
  assert.equal(state.count, "82/119");
  assert.equal((state.text.match(/зун/g) ?? []).length, 1);

  const scroll = state.scroll;
  await page.click(".find-all");
  state = await read();
  assert.equal(state.count, "0/0");
  assert.equal(/өвөл/i.test(state.text), false);
  assert.equal(state.scroll, scroll);

  await page.keyboard.press("Escape");
  assert.equal(await page.isHidden(".find-bar"), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "editor");
  await context.close();
});
