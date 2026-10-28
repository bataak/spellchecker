import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answer,
  editor,
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

const fileCount = (page: import("playwright").Page): Promise<number> =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("mdFiles") ?? "[]") as unknown[]).length,
  );

test("дискэн дээр өөрчлөгдсөн файлыг дахин нээхэд шинэ талбар үүсгэхгүй шинэчилнэ", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "reopen-")), "a.txt");
  writeFileSync(path, "ХУУЧИН агуулга");
  const page = await openPage(app, await app.context());
  await openFile(page, path);
  assert.equal(await editor(page), "ХУУЧИН агуулга");
  assert.equal(await fileCount(page), 1);

  writeFileSync(path, "ШИНЭ агуулга");
  await openFile(page, path);
  assert.equal(await editor(page), "ШИНЭ агуулга");
  assert.equal(await fileCount(page), 1);

  await typeAtEnd(page, " засвар");
  writeFileSync(path, "ГУРАВ дахь агуулга");
  await openFile(page, path);
  await page
    .getByText("«a.txt» файл дискэн дээр өөрчлөгджээ. Файлыг дахин дуудах уу?")
    .waitFor();
  await answer(page, "Болих");
  await page.waitForTimeout(400);
  assert.equal(await editor(page), "ШИНЭ агуулга засвар");

  await openFile(page, path);
  await answer(page, "Дахин дуудах");
  await page.waitForTimeout(600);
  assert.equal(await editor(page), "ГУРАВ дахь агуулга");
  assert.equal(await fileCount(page), 1);
  assert.deepEqual(errors(page), []);
});
