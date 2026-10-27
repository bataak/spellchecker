import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import {
  errors,
  openFile,
  openPage,
  startApp,
  typeAtEnd,
  type App,
} from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

function texFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), "talk-tex-")), "single.tex");
  writeFileSync(
    path,
    "\\documentclass{article}\n\\begin{document}\nӨглөө нар гарлаа.\n\\end{document}\n",
  );
  return path;
}

const box = (page: Page, selector: string) =>
  page.evaluate((target) => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el || el.offsetParent === null) return null;
    const { left, right, width } = el.getBoundingClientRect();
    return { left, right, width };
  }, selector);

async function commentStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(0, 4);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.locator(".collab-comment-btn").click();
  await page.locator(".talk-window").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
}

test("багтахгүй үед шүүмжийн цонх preview-ийн зүүн захад хөвнө", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openFile(page, texFile());
  await commentStart(page);
  const talk = (await box(page, ".talk-window"))!;
  const preview = (await box(page, ".preview-panel"))!;
  const area = (await box(page, ".editor-wrap"))!;
  assert.ok(
    Math.abs(talk.left - preview.left) < 2,
    `${talk.left} vs ${preview.left}`,
  );
  assert.ok(talk.left >= area.right - 2);
  assert.deepEqual(errors(page), []);
});

test("төслийн самбар багтах өргөнд шүүмжийн цонх preview-ийг нарийсгаж багана болно", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1865, height: 1000 });
  await openFile(page, texFile());
  const measure = () =>
    page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--editor-measure"),
    );
  const before = await measure();
  await commentStart(page);
  const talk = (await box(page, ".talk-window"))!;
  const area = (await box(page, ".editor-wrap"))!;
  const preview = (await box(page, ".preview-panel"))!;
  assert.ok(talk.width >= 236 && talk.width <= 358, String(talk.width));
  assert.ok(talk.right <= area.left);
  assert.ok(preview.right <= 1865);
  assert.equal(await measure(), before);
  assert.deepEqual(errors(page), []);
});

test("зай хүрэлцвэл шүүмжийн цонх агшиж багана болно", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1600, height: 1000 });
  await typeAtEnd(page, "Өглөө нар гарлаа.");
  await commentStart(page);
  const talk = (await box(page, ".talk-window"))!;
  const area = (await box(page, ".editor-wrap"))!;
  assert.ok(talk.width >= 236 && talk.width < 358, String(talk.width));
  assert.ok(talk.right <= area.left);
  assert.deepEqual(errors(page), []);
});

test("шүүмжийн цонх төслийн самбарын байрыг эзэлж, хаагдахад самбар буцна", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openFile(page, app.files.project);
  await openFile(page, texFile());
  await page.evaluate(() =>
    document.querySelector<HTMLElement>(".project-toggle")?.click(),
  );
  await page.waitForTimeout(600);
  const before = (await box(page, ".editor-wrap"))!;
  assert.ok(await box(page, ".project-panel"));
  await commentStart(page);
  assert.equal(await box(page, ".project-panel"), null);
  const talk = (await box(page, ".talk-window"))!;
  const area = (await box(page, ".editor-wrap"))!;
  assert.ok(talk.width >= 236 && talk.width <= 358, String(talk.width));
  assert.ok(talk.right <= area.left);
  assert.ok(Math.abs(area.left - before.left) < 40);
  await page.locator('.talk-window [aria-label="Хаах"]').click();
  await page.waitForTimeout(600);
  assert.ok(await box(page, ".project-panel"));
  assert.deepEqual(errors(page), []);
});

test("төслийн самбар ба шүүмжийн цонх сүүлд дарснаараа байраа ээлжилнэ", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openFile(page, app.files.project);
  await openFile(page, texFile());
  const toggle = page.locator(".project-toggle");
  await toggle.click();
  await page.waitForTimeout(600);
  await commentStart(page);
  await page.keyboard.type("Тодруулга");
  await page.keyboard.press("Enter");
  await page.locator(".talk-thread", { hasText: "Тодруулга" }).waitFor();
  assert.equal(await box(page, ".project-panel"), null);
  await toggle.waitFor({ state: "visible" });
  await toggle.click();
  await page.waitForTimeout(600);
  assert.ok(await box(page, ".project-panel"));
  assert.equal(await box(page, ".talk-window"), null);
  assert.equal(await toggle.isVisible(), false);
  await page.locator(".talk-trigger").click();
  await page.waitForTimeout(600);
  assert.ok(await box(page, ".talk-window"));
  assert.equal(await box(page, ".project-panel"), null);
  await toggle.click();
  await page.waitForTimeout(600);
  await page.locator('.project-panel [aria-label="Самбарыг нуух"]').click();
  await page.waitForTimeout(600);
  assert.equal(await box(page, ".project-panel"), null);
  assert.ok(await box(page, ".talk-window"));
  assert.deepEqual(errors(page), []);
});

test("хулганаар чирж сонгох явцад шүүмжийн товч гарч сонголтыг тасалдуулахгүй", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1400, height: 900 });
  const lines = Array.from(
    { length: 12 },
    (_, i) => `Мөр ${i + 1}: өглөө нар гарч, өдөр сайхан байлаа.`,
  ).join("\n");
  await typeAtEnd(page, lines);
  await page.waitForTimeout(600);
  const area = (await page.locator("#editor").boundingBox())!;
  const state = () =>
    page.evaluate(() => ({
      shown: !document.querySelector<HTMLElement>(".collab-comment-btn")!
        .hidden,
      end: document.querySelector<HTMLTextAreaElement>("#editor")!.selectionEnd,
    }));
  await page.mouse.move(area.x + 60, area.y + 20);
  await page.mouse.down();
  let last = 0;
  for (let y = 26; y <= 320; y += 6) {
    await page.mouse.move(area.x + 300, area.y + y, { steps: 2 });
    await page.waitForTimeout(30);
    const now = await state();
    assert.equal(now.shown, false, `y=${y}`);
    assert.ok(now.end >= last, `y=${y}: ${now.end} < ${last}`);
    last = now.end;
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal((await state()).shown, true);
  assert.deepEqual(errors(page), []);
});
