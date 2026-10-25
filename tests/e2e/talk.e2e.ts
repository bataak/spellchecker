import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  editor,
  errors,
  openPage,
  startApp,
  typeAtEnd,
  until,
  type App,
} from "./harness.ts";
import { startCollab, type CollabServer } from "../helpers/collabserver.ts";

let app: App;
let collab: CollabServer;
before(async () => {
  collab = await startCollab();
  process.env.VITE_COLLAB_URL = collab.url;
  app = await startApp();
  await collab.allow(new URL(app.url).origin);
});
after(async () => {
  await app.close();
  await collab.close();
});

async function invite(page: Page): Promise<string> {
  await page.click("#collabBtn");
  await page.getByText("Шинэ урилга үүсгэх").click();
  await page.waitForSelector(".collab-link", { timeout: 20000 });
  const link = await page.inputValue(".collab-link");
  await page.keyboard.press("Escape");
  return link;
}

const badge = (page: Page): Promise<string> =>
  page
    .locator(".talk-trigger .talk-badge")
    .textContent({ timeout: 15000 })
    .then((text) => text ?? "");

test("хамтын бичвэрт хэлэлцэж, хамтрагчийн өөрчлөлтийг харж буцаана", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Сайн байна уу.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  await until(
    () => editor(guest),
    (text) => text.includes("Сайн байна уу."),
    20000,
  );

  await guest.locator(".talk-trigger").click();
  await guest.locator(".talk-input").fill("Энэ өгүүлбэрийг засъя");
  await guest.keyboard.press("Enter");
  assert.equal(await badge(owner), "1");
  await owner.locator(".talk-trigger").click();
  await owner
    .locator(".talk-msg-text", { hasText: "Энэ өгүүлбэрийг засъя" })
    .waitFor();
  assert.equal(await owner.locator(".talk-trigger .talk-badge").count(), 0);

  await typeAtEnd(guest, " Нэмэлт.");
  await until(
    () => editor(owner),
    (text) => text.endsWith(" Нэмэлт."),
    20000,
  );
  await owner.locator(".talk-tab", { hasText: "Өөрчлөлт" }).click();
  const row = owner.locator(".talk-change");
  await row.first().waitFor({ timeout: 15000 });
  assert.match(
    await row.first().locator(".talk-change-who").innerText(),
    /нэмсэн/,
  );
  assert.match(await row.first().locator("ins").innerText(), /Нэмэлт/);
  await row.first().locator(".talk-change-act.is-reject").click();
  await until(
    () => editor(guest),
    (text) => !text.includes("Нэмэлт"),
    20000,
  );
  await owner.locator(".talk-empty", { hasText: "өөрчлөлт алга" }).waitFor();
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});
