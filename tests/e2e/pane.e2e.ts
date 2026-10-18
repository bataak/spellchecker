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
