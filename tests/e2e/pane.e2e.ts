import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  chooseSlot,
  errors,
  openPage,
  startApp,
  typeAtEnd,
  until,
  type App,
} from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const shown = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      el.getBoundingClientRect().width > 0
    );
  }, selector);

const resize = async (page: Page, width: number): Promise<void> => {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(400);
};

test("харагдац хажууд багтахгүй үед товчоор бичвэртэй сольж харуулна", async () => {
  const page = await openPage(app, await app.context());
  await chooseSlot(page, "Тайлан");
  await typeAtEnd(page, "# Гарчиг\n\nЭнэ бол **тод** үг.\n");

  for (const width of [700, 1280]) {
    await resize(page, width);
    assert.equal(await shown(page, ".preview-panel"), false);
    assert.equal(await shown(page, ".pane-toggle"), true, `товч ${width}`);
    await page.click(".pane-toggle");
    await until(
      () => page.locator(".preview-body").innerHTML(),
      (html) => html.includes("<h1"),
    );
    assert.equal(await shown(page, ".preview-panel"), true);
    assert.equal(await shown(page, ".editor-wrap"), false);
    await page.click(".pane-toggle");
    assert.equal(await shown(page, ".editor-wrap"), true);
    assert.equal(await shown(page, ".preview-panel"), false);
  }

  await page.click(".pane-toggle");
  await resize(page, 1920);
  assert.equal(await shown(page, ".pane-toggle"), false);
  assert.equal(await shown(page, ".editor-wrap"), true);
  assert.equal(await shown(page, ".preview-panel"), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.pane),
    undefined,
  );
  assert.deepEqual(errors(page), []);
});

test("гар утсан дээр харагдацад шилжихэд бичвэрт харагдаж байсан мөрийг харуулна", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 390, height: 800 });
  await chooseSlot(page, "Тайлан");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = Array.from(
      { length: 80 },
      (_, i) => `Мөр ${i + 1}: Энэ бол туршилтын өгүүлбэр юм.`,
    ).join("\n\n");
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.blur();
  });
  await page.waitForTimeout(2200);
  const visible = await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.scrollTop = (area.scrollHeight - area.clientHeight) * 0.7;
    area.dispatchEvent(new Event("scroll"));
    const box = area.getBoundingClientRect();
    const numbers: number[] = [];
    const walker = document.createTreeWalker(
      document.querySelector("#backdrop")!,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const found of text.matchAll(/Мөр (\d+):/g)) {
        const range = document.createRange();
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        const rect = range.getBoundingClientRect();
        if (rect.top >= box.top && rect.bottom <= box.bottom)
          numbers.push(Number(found[1]));
      }
    }
    return numbers;
  });
  assert.ok(visible.length > 3 && visible[0]! > 30, `харагдсан: ${visible}`);
  await page.click(".pane-toggle");
  const marked = await until(
    () =>
      page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(".preview-body")!;
        const mark = body.querySelector<HTMLElement>(".sync-mark");
        if (!mark) return null;
        const at = mark.getBoundingClientRect();
        const frame = body.getBoundingClientRect();
        if (at.top < frame.top || at.bottom > frame.bottom) return null;
        const hit = [...body.querySelectorAll("p")].find((p) => {
          const rect = p.getBoundingClientRect();
          return rect.top < at.bottom && rect.bottom > at.top;
        });
        const found = /^Мөр (\d+):/.exec(hit?.textContent ?? "");
        return found ? Number(found[1]) : null;
      }),
    (value) => value !== null,
  );
  assert.ok(
    marked !== null && visible.includes(marked),
    `харагдацын мөр ${marked}, бичвэрт ${visible}`,
  );
  assert.deepEqual(errors(page), []);
});
