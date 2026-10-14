import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseProject,
  chooseSlot,
  editor,
  openFile,
  openPage,
  projectDirty,
  projectFile,
  startApp,
  status,
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

test("Бичвэр цонх уруу шилжихэд нээлттэй .sty файл хоосрохгүй", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Бичвэр нэгийн агуулга");
  await openFile(page, app.files.project);
  await projectFile(page, "mystyle.sty");
  await chooseSlot(page, "Бичвэр 1");
  assert.equal(await editor(page), "Бичвэр нэгийн агуулга");
  await chooseProject(page);
  assert.ok((await editor(page)).startsWith("% mystyle"));
  assert.deepEqual(await projectDirty(page), []);

  await typeAtEnd(page, "\n% нэмсэн мөр");
  await chooseSlot(page, "Бичвэр 2");
  await chooseProject(page);
  assert.ok((await editor(page)).endsWith("% нэмсэн мөр"));
});

test("файл хаахад цэс товчныхоо доор үлдэнэ", async () => {
  const page = await openPage(app, await app.context());
  for (const file of [app.files.a, app.files.b, app.files.docx])
    await openFile(page, file);
  await page.click("#editor");
  await page.waitForTimeout(400);
  await page.click(".md-template");
  for (let i = 0; i < 2; i += 1) {
    await page.locator(".md-menu-close").first().click();
    await page.waitForTimeout(800);
    const [menu, button] = await page.evaluate(() => [
      document.querySelector(".md-menu")!.getBoundingClientRect().left,
      document.querySelector(".md-template")!.getBoundingClientRect().left,
    ]);
    assert.ok(Math.abs(menu - button) < 40, `${menu} vs ${button}`);
  }
});

test("талбар цэвэрлэсний дараа хэвлэх алдааг хэлнэ", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await page.waitForTimeout(3000);
  await page
    .locator('button[title*="Файлыг хааж"], button[aria-label*="Файлыг хааж"]')
    .first()
    .click();
  await page.waitForTimeout(1000);
  await page.click("#printBtn");
  const label = await until(
    () =>
      page.evaluate(() => document.querySelector("#printBtn")!.textContent!),
    (text) => /чадсангүй/.test(text),
    30000,
  );
  assert.match(label, /Хэвлэж чадсангүй/);
  assert.match(await status(page), /PDF үүсгэж чадсангүй/);
});
