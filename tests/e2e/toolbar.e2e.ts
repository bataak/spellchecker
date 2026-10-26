import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { errors, openPage, startApp, type App } from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

test("нарийн дэлгэцэд доод цэс төгсгөл хүртэл гүйж, буцаж татагдахгүй", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.reload();
  await page.waitForSelector("#editor");
  const max = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".toolbar")!;
    return bar.scrollWidth - bar.clientWidth;
  });
  assert.ok(max > 0);
  await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".toolbar")!;
    bar.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const end = page.locator(".toolbar ~ .scroll-arrow.is-end").first();
  await end.waitFor({ state: "visible" });
  await end.click();
  await page.waitForTimeout(1200);
  const gap = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".toolbar")!;
    const open = document.querySelector<HTMLElement>("#openBtn")!;
    return (
      open.getBoundingClientRect().right - bar.getBoundingClientRect().right
    );
  });
  assert.ok(gap <= 1, String(gap));
  assert.equal(await end.isVisible(), false);
  assert.deepEqual(errors(page), []);
});
