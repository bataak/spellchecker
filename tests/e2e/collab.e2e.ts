import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  editor,
  errors,
  openPage,
  projectFile,
  startApp,
  until,
  type App,
} from "./harness.ts";
import { startCollab, type CollabServer } from "../helpers/collabserver.ts";
import { FakeGithub } from "../helpers/fakegithub.ts";
import { MAIN, commit, openMore, openPanel, rows } from "./gitsteps.ts";

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

async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await page.keyboard.type(text);
}

async function shownRows(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".project-panel");
    if (panel?.hidden)
      document.querySelector<HTMLElement>(".project-toggle")?.click();
  });
  return rows(page);
}

async function invite(page: Page): Promise<string> {
  await page.click("#collabBtn");
  await page.getByText("Шинэ урилга үүсгэх").click();
  await page.waitForSelector(".collab-link", { timeout: 20000 });
  const link = await page.inputValue(".collab-link");
  await page.keyboard.press("Escape");
  return link;
}

test("git төслийг хуваалцахад хамтрагчийн засвар үүсгэгчийн commit-д орж, хамтрагч өөрөө commit хийхгүй", async () => {
  const github = new FakeGithub({
    "thesis/main.tex": MAIN,
    "thesis/ch.tex": "Бүлэг нэг.\n",
    "thesis/fig.png": "\u0089PNG зураг",
  });
  const ownerContext = await app.context();
  await github.attach(ownerContext);
  const owner = await openPage(app, ownerContext);
  await openPanel(owner);
  await owner.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(owner);
  await owner.fill('.git-panel input[name="dir"]', "thesis");
  await owner.fill('.git-panel input[name="token"]', "tok");
  await owner.click(".git-panel .export-confirm");
  await until(
    () => rows(owner),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  const link = await invite(owner);

  const guest = await openPage(app, await app.context());
  await guest.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
  const shared = await until(
    () => shownRows(guest),
    (paths) => paths.includes("ch.tex") && paths.includes("fig.png"),
    30000,
  );
  assert.deepEqual(shared.sort(), ["ch.tex", "fig.png", "main.tex"]);

  await projectFile(guest, "ch.tex");
  await typeAtEnd(guest, "Хамтрагчийн мөр.");
  await projectFile(owner, "ch.tex");
  await until(
    () => editor(owner),
    (text) => text.includes("Хамтрагчийн мөр."),
    20000,
  );

  await owner.click('.project-foot .talk-toggle[aria-label="Өөрчлөлт"]');
  const change = owner.locator(".project-talk .talk-change", {
    hasText: "Хамтрагчийн мөр.",
  });
  await change.waitFor({ timeout: 15000 });
  assert.equal(await change.locator(".talk-change-path").innerText(), "ch.tex");
  assert.equal(await owner.locator(".project-tree").isVisible(), false);
  await owner.click('.project-foot .talk-toggle[aria-label="Хэлэлцэх"]');
  await owner.locator(".project-talk .talk-input").fill("Шалгалаа");
  await owner.keyboard.press("Enter");
  await guest
    .locator('.project-foot .talk-toggle[aria-label="Хэлэлцэх"] .talk-badge')
    .waitFor({ timeout: 15000 });
  await owner.click('.project-foot .talk-toggle[aria-label="Хэлэлцэх"]');
  assert.equal(await owner.locator(".project-tree").isVisible(), true);

  await commit(owner);
  await until(
    () => Promise.resolve(github.text("thesis/ch.tex") ?? ""),
    (text) => text.includes("Хамтрагчийн мөр."),
    15000,
  );

  await guest.keyboard.press("Control+s");
  await guest.waitForTimeout(1000);
  assert.equal(await guest.locator(".git-panel").count(), 0);
  assert.deepEqual(errors(owner), []);
  assert.deepEqual(errors(guest), []);
});
