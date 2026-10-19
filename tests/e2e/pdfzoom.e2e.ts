import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext, Page } from "playwright";
import { chooseSlot, ready, startApp, until, type App } from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const TEX =
  "\\documentclass{article}\n\\begin{document}\nСайн байна уу.\n\\end{document}\n";

const openPhone = async (deviceScaleFactor = 1) => {
  const context = await app.browser.newContext({
    viewport: { width: 390, height: 800 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor,
  });
  const page = await context.newPage();
  await page.goto(app.url);
  await ready(page);
  await chooseSlot(page, "Судалгаа");
  await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = text;
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, TEX);
  await page.waitForTimeout(800);
  await page.tap(".pane-toggle");
  const shown = await until(
    () =>
      page.evaluate(
        () => !!document.querySelector(".preview-panel.has-pages canvas"),
      ),
    (value) => value,
    90000,
  );
  assert.equal(shown, true);
  return { context, page };
};

const pinchAt = async (
  context: BrowserContext,
  page: Page,
  from: number,
  to: number,
) => {
  const box = (await page
    .locator(".preview-panel .preview-body")
    .boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const fingers = (gap: number) => [
    { x: x - gap, y, id: 0 },
    { x: x + gap, y, id: 1 },
  ];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: fingers(from),
  });
  for (let step = 1; step <= 4; step++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: fingers(from + ((to - from) * step) / 4),
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
};

const zoomLevel = (page: Page) =>
  page.evaluate(
    () => document.querySelector(".pdf-zoom-level")?.textContent ?? "",
  );

test("гар утсан дээр PDF харагдацыг хоёр хуруугаар томруулна", async () => {
  const { context, page } = await openPhone();

  await pinchAt(context, page, 40, 80);

  const zoom = await until(
    () => zoomLevel(page),
    (value) => value === "200%",
  );
  assert.equal(zoom, "200%");
  assert.equal(await page.evaluate(() => visualViewport?.scale ?? 1), 1);
  await context.close();
});

test("дараалсан pinch-ийн дараа хуудас сунахгүй, томруулсан хэсэг тод зурагдана", async () => {
  const { context, page } = await openPhone(2);
  await pinchAt(context, page, 30, 90);
  await pinchAt(context, page, 30, 90);
  await until(
    () => zoomLevel(page),
    (value) => value === "600%",
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector<HTMLElement>(".pdf-pages")!.style.transform,
    ),
    "",
  );
  const detail = await until(
    () => page.evaluate(() => document.querySelectorAll(".pdf-detail").length),
    (count) => count > 0,
  );
  assert.ok(detail > 0);
  await pinchAt(context, page, 90, 30);
  await until(
    () => zoomLevel(page),
    (value) => value === "200%",
  );
  const left = await until(
    () => page.evaluate(() => document.querySelectorAll(".pdf-detail").length),
    (count) => count === 0,
  );
  assert.equal(left, 0);
  await context.close();
});
