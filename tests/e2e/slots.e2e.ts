import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseSlot,
  editor,
  errors,
  openFile,
  openPage,
  reload,
  settle,
  slotLabel,
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

test("цонх, бичвэр, нээлттэй файл дахин ачаалахад сэргэнэ", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Нэгдүгээр бичвэр");
  await settle(page);
  await reload(page);
  assert.equal(await slotLabel(page), "Бичвэр 1");
  assert.equal(await editor(page), "Нэгдүгээр бичвэр");

  await chooseSlot(page, "Бичвэр 2");
  await typeAtEnd(page, "Хоёрдугаар");
  await settle(page);
  await reload(page);
  assert.equal(await slotLabel(page), "Бичвэр 2");
  assert.equal(await editor(page), "Хоёрдугаар");

  await openFile(page, app.files.a);
  await typeAtEnd(page, "засвар");
  await settle(page);
  await reload(page);
  assert.equal(await editor(page), "Файл А\nзасвар");

  await chooseSlot(page, "Бичвэр 1");
  assert.equal(await editor(page), "Нэгдүгээр бичвэр");
  assert.deepEqual(errors(page), []);
});

test("Word файл дахин ачаалахад сэргэнэ", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.docx);
  assert.equal(await editor(page), "Ворд баримт байна.");
  await reload(page);
  await page.waitForTimeout(1500);
  assert.equal(await editor(page), "Ворд баримт байна.");
});

test("хуучин хувилбарын нийтлэг бичвэр цонх уруу шилжиж, хуучин түлхүүр устна", async () => {
  const context = await app.context();
  await context.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    localStorage.setItem("mn-spell:text", "Хуучин хувилбарын бичвэр");
    localStorage.setItem("mn-spell:caret", "3,3,0");
    localStorage.setItem("mdTemplate", "plain2");
    localStorage.setItem("mdDraft:plain2", "хуучирсан хуулбар");
  });
  const page = await openPage(app, context);
  assert.equal(await slotLabel(page), "Бичвэр 2");
  assert.equal(await editor(page), "Хуучин хувилбарын бичвэр");
  const stored = await page.evaluate(() => [
    localStorage.getItem("mdDraft:plain2"),
    localStorage.getItem("mn-spell:text"),
    localStorage.getItem("mn-spell:caret"),
  ]);
  assert.deepEqual(stored, ["Хуучин хувилбарын бичвэр", null, null]);
});

test("цонх сольсны дараа undo өмнөх цонхны бичвэрийг оруулахгүй", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "нэг хоёр гурав");
  await settle(page);
  await chooseSlot(page, "Бичвэр 2");
  await typeAtEnd(page, "дөрөв");
  await settle(page);
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("ControlOrMeta+z");
  await settle(page);
  assert.equal(await editor(page), "");
  await chooseSlot(page, "Бичвэр 1");
  assert.equal(await editor(page), "нэг хоёр гурав");
});

test("Бичвэр цонхонд preview-тэй байрлал идэвхгүй, markdown-д идэвхтэй", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 2400, height: 1000 });
  await page.waitForTimeout(500);
  const previews = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>(".measure-opt")]
        .filter((option) => option.dataset.layout?.endsWith("v"))
        .map((option) => option.disabled),
    );
  assert.ok((await previews()).every(Boolean));
  await typeAtEnd(
    page,
    "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n",
  );
  await settle(page);
  assert.ok((await previews()).every((disabled) => !disabled));
  await chooseSlot(page, "Өргөдөл");
  assert.ok((await previews()).every((disabled) => !disabled));
  await chooseSlot(page, "Бичвэр 2");
  assert.ok((await previews()).every(Boolean));
});
