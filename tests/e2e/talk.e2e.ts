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
  await guest.locator(".talk-chat .talk-input").fill("Энэ өгүүлбэрийг засъя");
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

async function selectWord(page: Page, word: string): Promise<void> {
  await page.evaluate((target) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    const start = area.value.indexOf(target);
    area.focus();
    area.setSelectionRange(start, start + target.length);
    document.dispatchEvent(new Event("selectionchange"));
  }, word);
}

test("сонгосон хэсэгт шүүмж бичиж, хамтрагч хариулж, шийднэ", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Өнөөдөр цаг агаар сайхан байна.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  await until(
    () => editor(guest),
    (text) => text.includes("сайхан байна."),
    20000,
  );

  await selectWord(owner, "цаг агаар");
  const button = owner.locator(".collab-comment-btn");
  await button.waitFor({ state: "visible" });
  await button.click();
  await owner
    .locator(".talk-compose-quote", { hasText: "цаг агаар" })
    .waitFor();
  await owner.locator(".talk-compose .talk-input").fill("Тодруулах уу?");
  await owner.keyboard.press("Enter");
  await owner.locator(".talk-thread", { hasText: "Тодруулах уу?" }).waitFor();
  await owner.locator(".collab-comment-mark").first().waitFor();

  await guest.locator(".collab-comment-mark").first().waitFor({
    timeout: 15000,
  });
  await guest.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    const at = area.value.indexOf("агаар");
    area.focus();
    area.setSelectionRange(at, at);
    area.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const thread = guest.locator(".talk-thread.is-active");
  await thread.waitFor();
  assert.match(await thread.innerText(), /Тодруулах уу\?/);
  await thread.locator(".talk-reply-input").fill("Тийм, Цельсээр");
  await guest.keyboard.press("Enter");

  await owner
    .locator(".talk-reply .talk-msg-text", { hasText: "Тийм, Цельсээр" })
    .waitFor({ timeout: 15000 });
  await owner.locator('[aria-label="Шийдсэн гэж тэмдэглэх"]').click();
  await until(
    () => guest.locator(".collab-comment-mark").count(),
    (count) => count === 0,
    15000,
  );
  assert.equal(await guest.locator(".talk-thread").count(), 0);
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});

test("хамтралгүй бичсэн шүүмж хадгалагдаж, хамтрахад шилжиж, хариу мэдэгдэнэ", async () => {
  const context = await app.context();
  const owner = await openPage(app, context);
  await typeAtEnd(owner, "Маргааш бороо орно гэсэн.");
  await selectWord(owner, "бороо");
  await owner.locator(".collab-comment-btn").click();
  await owner.locator(".talk-compose .talk-input").fill("Эх сурвалж?");
  await owner.keyboard.press("Enter");
  await owner.locator(".talk-thread", { hasText: "Эх сурвалж?" }).waitFor();
  await owner.locator(".collab-comment-mark").first().waitFor();
  assert.equal(
    (await owner.locator(".talk-trigger").innerText()).trim(),
    "Шүүмж",
  );
  assert.equal(await owner.locator(".talk-tab:not([hidden])").count(), 1);

  await owner.waitForTimeout(800);
  await owner.reload();
  await owner.locator(".collab-comment-mark").first().waitFor({
    timeout: 20000,
  });

  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  await guest.locator(".collab-comment-mark").first().waitFor({
    timeout: 20000,
  });
  assert.equal(await badge(guest), "1");
  await guest.locator(".talk-trigger").click();
  const thread = guest.locator(".talk-thread", { hasText: "Эх сурвалж?" });
  await thread.waitFor();
  assert.equal(
    await guest.locator(".talk-tab[aria-selected=true]").innerText(),
    "Шүүмж",
  );
  await thread.locator(".talk-reply-input").fill("Цаг уурын газар");
  await guest.keyboard.press("Enter");

  assert.equal(await badge(owner), "1");
  await owner.locator(".talk-trigger").click();
  await owner
    .locator(".talk-reply .talk-msg-text", { hasText: "Цаг уурын газар" })
    .waitFor();
  assert.equal(await owner.locator(".talk-trigger .talk-badge").count(), 0);
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});

test("хамтрагч бүр хэлэлцүүлэгт өөр өнгөтэй харагдана", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Нэг хоёр гурав дөрөв.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  await until(
    () => editor(guest),
    (text) => text.includes("дөрөв"),
    20000,
  );
  await owner.locator(".talk-trigger").click();
  await owner.locator(".talk-chat .talk-input").fill("Эзний зурвас");
  await owner.keyboard.press("Enter");
  await guest.locator(".talk-trigger").click();
  await guest
    .locator(".talk-msg-text", { hasText: "Эзний зурвас" })
    .waitFor({ timeout: 15000 });
  await guest.locator(".talk-chat .talk-input").fill("Зочны зурвас");
  await guest.keyboard.press("Enter");
  await owner
    .locator(".talk-msg-text", { hasText: "Зочны зурвас" })
    .waitFor({ timeout: 15000 });
  const colors = await owner.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".talk-msg .talk-dot")].map(
      (dot) => getComputedStyle(dot).backgroundColor,
    ),
  );
  assert.equal(colors.length, 2);
  assert.notEqual(colors[0], colors[1]);
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});

test("багтахгүй үед шүүмжийн цонх хөвж, бичвэр дээр дарахад хаагдана", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await page.setViewportSize({ width: 1150, height: 800 });
  await typeAtEnd(page, "Өглөө нар гарлаа.");
  await selectWord(page, "нар");
  await page.locator(".collab-comment-btn").click();
  const win = page.locator(".talk-window");
  await win.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-talk-float"),
    ),
    true,
  );
  await page.locator(".talk-compose .talk-input").fill("Тодруулга");
  await page.keyboard.press("Enter");
  await page.locator(".talk-thread", { hasText: "Тодруулга" }).waitFor();
  const box = (await page.locator("#editor").boundingBox())!;
  await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40);
  await win.waitFor({ state: "hidden" });
  assert.deepEqual(errors(page), []);
});
