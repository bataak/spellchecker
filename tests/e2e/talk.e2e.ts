import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  editor,
  errors,
  FIREFOX,
  openFile,
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
  await page.getByText("Урилга өгөх", { exact: true }).click();
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
  await owner
    .locator(".talk-changes-bar button", { hasText: "Татгалзсаныг харуулах" })
    .click();
  await owner
    .locator(".talk-change.is-rejected button", { hasText: "Сэргээх" })
    .click();
  await until(
    () => editor(guest),
    (text) => text.endsWith(" Нэмэлт."),
    20000,
  );
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
  assert.equal(
    await owner.evaluate(() =>
      document.activeElement?.matches(".talk-compose .talk-input"),
    ),
    true,
  );
  await owner.keyboard.type("Тодруулах уу?");
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
  assert.equal(
    await guest.evaluate(() =>
      document.activeElement?.matches(
        ".talk-thread.is-active .talk-reply-input",
      ),
    ),
    true,
  );
  await guest.keyboard.type("Тийм, Цельсээр");
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
  await page.keyboard.type("Тодруулга");
  await page.keyboard.press("Enter");
  await page.locator(".talk-thread", { hasText: "Тодруулга" }).waitFor();
  const box = (await page.locator("#editor").boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  await win.waitFor({ state: "hidden" });
  assert.deepEqual(errors(page), []);
});

test("Ctrl+Shift+Backspace бичвэртэй хамт шүүмж ба Шүүмж товчийг арилгана", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await typeAtEnd(page, "Үдэш бороо орно.");
  await selectWord(page, "бороо");
  await page.locator(".collab-comment-btn").click();
  await page.locator(".talk-compose .talk-input").fill("Шалгах");
  await page.keyboard.press("Enter");
  await page.locator(".collab-comment-mark").first().waitFor();
  const trigger = page.locator(".talk-trigger");
  await trigger.waitFor({ state: "visible" });
  await page.click("#editor");
  await page.keyboard.press("Control+Shift+Backspace");
  await trigger.waitFor({ state: "hidden" });
  await page.locator(".collab-comment-mark").first().waitFor({
    state: "detached",
  });
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector("#editor");
  await page.waitForTimeout(1500);
  assert.equal(await trigger.isVisible(), false);
  assert.deepEqual(errors(page), []);
});

test("хамтарч байхдаа цэвэрлэхэд шүүмж локалд буцаж хадгалагдахгүй", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Маргааш цас орно.");
  await invite(owner);
  await selectWord(owner, "цас");
  await owner.locator(".collab-comment-btn").click();
  await owner.locator(".talk-compose .talk-input").fill("Хамтын шүүмж");
  await owner.keyboard.press("Enter");
  await owner.locator(".talk-thread", { hasText: "Хамтын шүүмж" }).waitFor();
  await owner.click("#editor");
  await owner.keyboard.press("Control+Shift+Backspace");
  await owner.waitForTimeout(2000);
  assert.equal(await owner.locator(".talk-trigger").isVisible(), false);
  assert.equal(await owner.locator(".collab-comment-mark").count(), 0);
  assert.deepEqual(errors(owner), []);
});

test("эзэн хуваалцсан бичвэрийг цэвэрлэхэд асууж, хамтрагчийн хуулбарыг устгана", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Хуваалцсан нууц бичвэр.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  await until(
    () => editor(guest),
    (text) => text.includes("нууц бичвэр"),
    20000,
  );
  await selectWord(owner, "нууц");
  await owner.locator(".collab-comment-btn").click();
  await owner.keyboard.type("Эзний шүүмж");
  await owner.keyboard.press("Enter");
  await owner.locator(".talk-thread", { hasText: "Эзний шүүмж" }).waitFor();
  const dialog = owner.locator("dialog", {
    hasText: "Хуваалцсан бичвэрийг цэвэрлэх",
  });
  await owner.click("#editor");
  await owner.keyboard.press("Control+Shift+Backspace");
  await dialog.waitFor({ timeout: 15000 });
  await dialog.getByRole("button", { name: "Болих" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.match(await editor(owner), /нууц бичвэр/);

  await owner.click("#editor");
  await owner.keyboard.press("Control+Shift+Backspace");
  await dialog.getByRole("button", { name: "Бүрмөсөн устгах" }).click();
  await until(
    () => editor(owner),
    (text) => text === "",
    15000,
  );
  await until(
    () => editor(guest),
    (text) => !text.includes("нууц бичвэр"),
    20000,
  );
  await owner.waitForTimeout(1500);
  assert.equal(await owner.locator(".talk-trigger").isVisible(), false);
  assert.equal(await owner.locator(".collab-comment-mark").count(), 0);
  const notes = await owner.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("mn-spell", 1);
        open.onsuccess = () => {
          const keys = open.result
            .transaction("kv", "readonly")
            .objectStore("kv")
            .getAllKeys();
          keys.onsuccess = () =>
            resolve(
              keys.result.map(String).filter((key) => key.startsWith("notes:")),
            );
        };
      }),
  );
  assert.deepEqual(notes, []);
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});

test("шүүмжилсэн үгийн ард дарахад шүүмж нээгдэж, курсор ард нь үлдэнэ", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Өнөөдөр бороо");
  await page.waitForTimeout(700);
  await selectWord(page, "бороо");
  await page.locator(".collab-comment-btn").click();
  await page.keyboard.type("Сүүлийн үг");
  await page.keyboard.press("Enter");
  await page.locator(".collab-comment-mark").first().waitFor();
  await page.locator('.talk-window button[aria-label="Хаах"]').click();
  await page.locator(".talk-window").waitFor({ state: "hidden" });
  const mark = (await page
    .locator(".collab-comment-mark")
    .first()
    .boundingBox())!;
  await page.mouse.click(mark.x + mark.width + 2, mark.y + mark.height / 2);
  await page.locator(".talk-thread.is-active").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "editor");
  await page.keyboard.type(" орно");
  assert.match(await editor(page), /бороо орно$/);
  assert.deepEqual(errors(page), []);
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

async function joinedText(guest: Page, text: string): Promise<void> {
  await until(
    () => editor(guest),
    (value) => value.includes(text),
    20000,
  );
  assert.equal((await editor(guest)).includes("#j="), false);
}

test("урилгын холбоосыг бичвэрт буулгахад асууж, хамтын бичвэрт нэгдэнэ", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Буулгаж нэгдэх бичвэр.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.click("#editor");
  const paste = (answer: boolean) =>
    guest.evaluate(
      ([text, yes]) => {
        window.confirm = () => yes;
        const data = new DataTransfer();
        data.setData("text/plain", text);
        return document.querySelector("#editor")!.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            cancelable: true,
          }),
        );
      },
      [link, answer] as const,
    );
  assert.equal(await paste(false), true);
  assert.equal(await paste(true), false);
  await joinedText(guest, "Буулгаж нэгдэх бичвэр.");
  assert.deepEqual(errors(guest), []);
});

test("«Буулгах» товчоор урилгын холбоосыг буулгахад нэгдэнэ", async (t) => {
  if (FIREFOX) return t.skip("clipboard зөвшөөрөл зөвхөн Chromium-д");
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Товчоор нэгдэх бичвэр.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context({ clipboard: true }));
  await guest.evaluate((text) => navigator.clipboard.writeText(text), link);
  await guest.click("#pasteBtn");
  await joinedText(guest, "Товчоор нэгдэх бичвэр.");
  assert.deepEqual(errors(guest), []);
});

test("«Хамтрах» цонхонд урилгын холбоос оруулж нэгдэнэ", async () => {
  const owner = await openPage(app, await app.context());
  await typeAtEnd(owner, "Цонхоор нэгдэх бичвэр.");
  const link = await invite(owner);
  const guest = await openPage(app, await app.context());
  await guest.click("#collabBtn");
  await guest.getByText("Урилга авах", { exact: true }).click();
  await guest.fill(".collab-join-field", "энгийн бичвэр");
  await guest.keyboard.press("Enter");
  await guest.getByText("урилгын холбоос биш").waitFor();
  await guest.fill(".collab-join-field", "");
  await guest.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document
      .querySelector(".collab-join-field")!
      .dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, cancelable: true }),
      );
  }, link);
  await joinedText(guest, "Цонхоор нэгдэх бичвэр.");
  assert.deepEqual(errors(guest), []);
});
