import { after, before, test } from "node:test";
import assert from "node:assert/strict";
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

test("гар утсан дээр PDF харагдацыг хоёр хуруугаар томруулна", async () => {
  const context = await app.browser.newContext({
    viewport: { width: 390, height: 800 },
    isMobile: true,
    hasTouch: true,
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
    touchPoints: fingers(40),
  });
  for (let gap = 50; gap <= 80; gap += 10)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: fingers(gap),
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const zoom = await until(
    () =>
      page.evaluate(
        () => document.querySelector(".pdf-zoom-level")?.textContent ?? "",
      ),
    (value) => value === "200%",
  );
  assert.equal(zoom, "200%");
  assert.equal(await page.evaluate(() => visualViewport?.scale ?? 1), 1);
  await context.close();
});
