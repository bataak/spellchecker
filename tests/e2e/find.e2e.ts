import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chooseSlot, FIREFOX, ready, startApp, type App } from "./harness.ts";

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
        mirror: document
          .querySelector("#backdrop")!
          .textContent!.replace(/\u200b/g, ""),
      };
    });
  const widths = await page.$$eval(".find-input", (els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  assert.equal(widths.length, 2);
  assert.equal(widths[0], widths[1]);
  await page.waitForFunction(() => document.querySelector(".find-mark"));
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
  assert.equal((state.text.match(/зун/gi) ?? []).length, 1);
  assert.equal(state.mirror, state.text.replace(/\n/g, ""));

  const scroll = state.scroll;
  await page.click(".find-all");
  state = await read();
  assert.equal(state.count, "0/0");
  assert.equal(/өвөл/i.test(state.text), false);
  assert.ok(state.text.startsWith("0. Зун болж байна. Энэ зун хүйтэн."));
  assert.equal(state.mirror, state.text.replace(/\n/g, ""));
  assert.equal(state.scroll, scroll);

  await page.keyboard.press("Escape");
  assert.equal(await page.isHidden(".find-bar"), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "editor");

  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  const box = async () => (await page.locator(".find-bar").boundingBox())!;
  const before = await box();

  const grip = (await page.locator(".find-grip").boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 150, grip.y + 120, { steps: 5 });
  await page.mouse.up();
  const moved = await box();
  assert.ok(Math.abs(moved.x - (before.x - 150 - grip.width / 2)) < 2);
  assert.ok(Math.abs(moved.y - (before.y + 120 - grip.height / 2)) < 2);

  const grip2 = (await page.locator(".find-grip").boundingBox())!;
  await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + 4);
  await page.mouse.down();
  const view = page.viewportSize()!;
  await page.mouse.move(1, view.height - 1, { steps: 5 });
  await page.mouse.up();
  const outside = await box();
  const editor = (await page.locator(".editor-wrap").boundingBox())!;
  assert.equal(Math.round(outside.x), 0);
  assert.equal(Math.round(outside.y + outside.height), view.height);
  assert.ok(
    outside.y + outside.height > editor.y + editor.height ||
      outside.x < editor.x,
  );

  await page.reload();
  await ready(page);
  await chooseSlot(page, "Судалгаа");
  await page.locator("#editor").focus();
  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  const restored = await box();
  assert.ok(Math.abs(restored.x - outside.x) < 2);
  assert.ok(Math.abs(restored.y - outside.y) < 2);
  await context.close();
});

test("курсороос хайж, бүтэн үгээр ялгаж, хаахад анхны байрлалдаа буцна", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  await ready(page);
  await chooseSlot(page, "Судалгаа");
  const lines = Array.from(
    { length: 60 },
    (_, i) => `${i}. Өвөл болж байна. Энэ өвөл хүйтэн. Өвлийн өвөлжөө.`,
  ).join("\n");
  const origin = await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = text;
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.focus();
    const at = text.indexOf("30. ");
    area.setSelectionRange(at, at);
    area.scrollTop = area.scrollHeight / 2;
    return { at, scroll: area.scrollTop };
  }, lines);
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  await page.keyboard.type("өвөл");
  const count = () => page.textContent(".find-count");
  assert.equal(await count(), "91/180");

  await page.keyboard.press("Alt+w");
  assert.equal(await page.getAttribute(".find-word", "aria-pressed"), "true");
  assert.equal(await count(), "61/120");
  for (let i = 0; i < 60; i++) await page.keyboard.press("Enter");
  assert.equal(await count(), "1/120");

  await page.keyboard.press("Escape");
  const back = await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    return {
      start: area.selectionStart,
      end: area.selectionEnd,
      scroll: area.scrollTop,
    };
  });
  assert.deepEqual(back, {
    start: origin.at,
    end: origin.at,
    scroll: origin.scroll,
  });

  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  assert.equal(await count(), "61/120");
  await page.fill(".find-input[placeholder='Солих']", "зун");
  await page.click(".find-all");
  await page.keyboard.press("Escape");
  const after = await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    return {
      rest: area.value.slice(area.selectionStart, area.selectionStart + 4),
      lower: (area.value.match(/өвөлжөө/g) ?? []).length,
      scroll: area.scrollTop,
    };
  });
  assert.equal(after.rest, "30. ");
  assert.equal(after.lower, 60);
  assert.equal(after.scroll, origin.scroll);
  await context.close();
});

test("курсорыг зөөсний дараа солих нь курсорын үгээс үргэлжилж, яг горим ажиллана", async () => {
  const context = await app.context();
  const page = await context.newPage();
  await page.goto(app.url);
  await ready(page);
  await chooseSlot(page, "Судалгаа");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = "баих нэг. Баих хоёр. баих гурав.";
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.focus();
    area.setSelectionRange(0, 0);
  });
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  await page.keyboard.press((mac ? "Meta" : "Control") + "+f");
  await page.keyboard.type("баих");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const count = () => page.textContent(".find-count");
  assert.equal(await count(), "3/3");

  await page.locator("#editor").click({ position: { x: 60, y: 30 } });
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.setSelectionRange(2, 2);
  });
  await page.fill(".find-input[placeholder='Солих']", "байх");
  await page.click(".find-one");
  const text = () => page.inputValue("#editor");
  assert.equal(await text(), "байх нэг. Баих хоёр. баих гурав.");
  assert.equal(await count(), "1/2");

  await page.keyboard.press("Alt+c");
  assert.equal(await page.getAttribute(".find-exact", "aria-pressed"), "true");
  assert.equal(await count(), "1/1");
  await page.fill(".find-input[placeholder='Солих']", "БАЙХ");
  await page.click(".find-all");
  assert.equal(await text(), "байх нэг. Баих хоёр. БАЙХ гурав.");
  await context.close();
});

test(
  "утсан дээр хайх товчоор нээж, чирж зөөж, яг горимоор хайж солино",
  { skip: FIREFOX && "isMobile-ийг Firefox дэмжихгүй" },
  async () => {
    const context = await app.browser.newContext({
      viewport: { width: 390, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(app.url);
    await ready(page);
    await chooseSlot(page, "Судалгаа");
    await page.evaluate(() => {
      const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
      area.value = "Өвөл болж байна. Энэ өвөл хүйтэн.";
      area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await page.tap("#findBtn");
    assert.equal(await page.isVisible(".find-bar"), true);
    assert.equal(
      await page.isVisible(".find-input[placeholder='Солих']"),
      true,
    );
    assert.equal(await page.isVisible(".find-grip"), true);
    const bar = (await page.locator(".find-bar").boundingBox())!;
    assert.ok(bar.x >= 0 && bar.x + bar.width <= 390);
    const size = await page.$eval(".find-input", (el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    assert.equal(size, 16);

    const grip = (await page.locator(".find-grip").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 10);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 210, { steps: 5 });
    await page.mouse.up();
    const moved = (await page.locator(".find-bar").boundingBox())!;
    assert.ok(Math.abs(moved.y - bar.y - 200) < 2);

    await page.fill(".find-input[placeholder='Хайх']", "өвөл");
    assert.equal(await page.textContent(".find-count"), "1/2");
    await page.tap(".find-exact");
    assert.equal(await page.textContent(".find-count"), "1/1");
    await page.fill(".find-input[placeholder='Солих']", "зун");
    await page.tap(".find-all");
    assert.equal(
      await page.inputValue("#editor"),
      "Өвөл болж байна. Энэ зун хүйтэн.",
    );
    await page.tap(".find-more");
    assert.equal(await page.isHidden(".find-input[placeholder='Солих']"), true);
    assert.equal(await page.isVisible(".find-exact"), true);
    await page.tap("#findBtn");
    assert.equal(await page.isHidden(".find-bar"), true);
    await context.close();
  },
);
