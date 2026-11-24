import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  errors,
  openFile,
  openPage,
  startApp,
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
    return style.display !== "none" && el.getBoundingClientRect().width > 0;
  }, selector);

const pressWrite = (page: Page): Promise<void> =>
  page.keyboard.press("Control+Shift+F");

test("LaTeX бичих горим PDF-ийг үлдээж, зөвхөн бичвэр сонголтоор нууна", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 2000, height: 1000 });
  await openFile(page, app.files.project);
  await until(
    () => shown(page, ".preview-panel"),
    (on) => on,
  );
  await page.click(".project-toggle").catch(() => undefined);
  await until(
    () => shown(page, ".project-panel"),
    (on) => on,
  );

  await page.focus("#editor");
  await pressWrite(page);
  await until(
    () => shown(page, ".topbar"),
    (on) => !on,
  );
  assert.equal(await shown(page, ".preview-panel"), true);
  assert.equal(await shown(page, ".project-panel"), false);
  assert.equal(await shown(page, ".project-toggle"), false);
  assert.equal(await shown(page, ".tex-compile"), true);

  await page.click(".measure-btn");
  await page.click('.measure-write[data-kind="text"]');
  await until(
    () => shown(page, ".preview-panel"),
    (on) => !on,
  );
  assert.equal(await shown(page, ".topbar"), false);

  await pressWrite(page);
  await until(
    () => shown(page, ".topbar"),
    (on) => on,
  );
  assert.equal(await shown(page, ".preview-panel"), true);
  assert.equal(await shown(page, ".project-panel"), true);

  await pressWrite(page);
  await until(
    () => shown(page, ".topbar"),
    (on) => !on,
  );
  assert.equal(await shown(page, ".preview-panel"), false);
  assert.deepEqual(errors(page), []);
});
