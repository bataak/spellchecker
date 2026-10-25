import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  editor,
  errors,
  status,
  openPage,
  projectFile,
  reload,
  startApp,
  until,
  type App,
} from "./harness.ts";
import { FakeGithub } from "../helpers/fakegithub.ts";
import { MAIN, commit, openMore, openPanel, rows } from "./gitsteps.ts";
import { FakeGitlab, GITLAB_PROJECT } from "../helpers/fakegitlab.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

test("GitHub-аас төсөл нээж, засаад commit хийж, дахин ачаалсны дараа ч үргэлжлүүлнэ", async () => {
  const github = new FakeGithub({
    "README.md": "readme",
    "thesis/main.tex": MAIN,
    "thesis/ch.tex": "Бүлэг нэг.\n",
  });
  const context = await app.context();
  await github.attach(context);
  const page = await openPage(app, context);
  await openPanel(page);
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "thesis");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  assert.deepEqual((await rows(page)).sort(), ["ch.tex", "main.tex"]);

  await projectFile(page, "ch.tex");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await page.keyboard.type("Хоёр дахь мөр.");
  await commit(page);
  await until(
    () => Promise.resolve(github.text("thesis/ch.tex") ?? ""),
    (text) => text.includes("Хоёр дахь мөр."),
    15000,
  );
  assert.equal(github.lastMessage(), "Засвар: ch.tex");
  assert.ok(github.tokens.every((token) => token === "Bearer tok"));
  assert.equal(github.text("README.md"), "readme");

  await reload(page);
  await page.waitForTimeout(1500);
  await projectFile(page, "ch.tex");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await page.keyboard.type(" Гурав.");
  await commit(page, "Гурав дахь засвар");
  await until(
    () => Promise.resolve(github.lastMessage()),
    (message) => message === "Гурав дахь засвар",
    15000,
  );
  assert.ok(github.text("thesis/ch.tex")!.includes("Гурав."));

  github.push({ "thesis/ch.tex": "Бусдын засвар.\n" });
  const before = github.branches.get("main");
  await page.keyboard.type(" Дөрөв.");
  await commit(page);
  await until(
    () =>
      page.evaluate(() => document.querySelector("#status")?.textContent ?? ""),
    (text) => text.includes("ch.tex"),
    15000,
  );
  assert.equal(github.branches.get("main"), before);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("GitLab-аас дэд бүлгийн төсөл нээж commit хийнэ", async () => {
  const gitlab = new FakeGitlab(
    {
      "README.md": "readme",
      "tex/main.tex": MAIN,
      "tex/ch.tex": "Бүлэг нэг.\n",
    },
    "https://gitlab.com",
  );
  const context = await app.context();
  await gitlab.attach(context);
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "gitlab");
  await page.fill('.git-panel input[name="repo"]', GITLAB_PROJECT);
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "tex");
  await page.fill('.git-panel input[name="token"]', "glpat");
  const help = await page.getAttribute(".git-note a", "href");
  assert.equal(
    help,
    "https://gitlab.com/-/user_settings/personal_access_tokens",
  );
  await page.click(".git-panel .export-confirm");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  await projectFile(page, "ch.tex");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await page.keyboard.type("GitLab мөр.");
  await commit(page, "GitLab-д засвар");
  await until(
    () => Promise.resolve(gitlab.lastMessage()),
    (message) => message === "GitLab-д засвар",
    15000,
  );
  assert.ok(gitlab.text("tex/ch.tex")!.includes("GitLab мөр."));
  assert.equal(gitlab.text("README.md"), "readme");
  assert.ok(gitlab.tokens.every((token) => token === "Bearer glpat"));
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("олон хавтсанд үндсэн файл байвал хавтас сонгуулж, тэр хавтсыг нээнэ", async () => {
  const doc = (word: string): string =>
    "\\documentclass{article}\n\\begin{document}\n" +
    word +
    "\n\\end{document}\n";
  const github = new FakeGithub({
    "csm301/exam1/main.tex": doc("Нэг"),
    "csm301/exam2/main.tex": doc("Хоёр"),
    "figs/a.txt": "a",
  });
  const context = await app.context();
  await github.attach(context);
  const page = await openPage(app, context);
  await page.setViewportSize({ width: 800, height: 900 });
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  const folder = page.locator('.git-panel select[name="folder"]');
  await folder.waitFor({ timeout: 20000 });
  assert.deepEqual(
    await folder
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      ),
    ["csm301/exam1", "csm301/exam2"],
  );
  assert.equal(await page.locator(".git-panel").count(), 2);
  assert.equal(await page.locator(".git-panel:visible").count(), 1);
  await folder.selectOption("csm301/exam2");
  await page.click(".git-panel:visible .export-confirm");
  await until(
    () =>
      page.evaluate(
        () => document.querySelector<HTMLTextAreaElement>("#editor")!.value,
      ),
    (text) => text.includes("Хоёр"),
    20000,
  );
  assert.deepEqual(await rows(page), [
    "csm301",
    "csm301/exam2",
    "csm301/exam2/main.tex",
  ]);
  assert.equal(await page.locator(".project-skip").count(), 2);
  await page.locator(".project-skip").first().click();
  await until(
    () => rows(page),
    (paths) => paths.includes("figs/a.txt") && paths.includes("csm301/exam1"),
    5000,
  );
  assert.equal(await page.locator(".project-skip").count(), 0);
  assert.equal(await page.isVisible(".project-panel"), true);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("үндсэн файлгүй repo-г нээхэд алдааг цонхон дотор харуулна", async () => {
  const github = new FakeGithub({
    "csm301/soril1.tex": "\\begin{question}\nА\n\\end{question}\n",
  });
  const context = await app.context();
  await github.attach(context);
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  const error = page.locator(".git-panel .export-error");
  await error.waitFor({ timeout: 20000 });
  assert.match(
    (await error.textContent()) ?? "",
    /үндсэн \.tex файл олдсонгүй/,
  );
  assert.equal(await page.textContent(".git-panel .export-confirm"), "Нээх");
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("том repo уншиж байхад явцыг харуулж, Болих товчоор зогсооно", async () => {
  const files: Record<string, string> = { "main.tex": MAIN };
  for (let i = 0; i < 40; i++) files["ch" + i + ".tex"] = "Бүлэг " + i + ".\n";
  const github = new FakeGithub(files);
  const context = await app.context();
  await github.attach(context);
  let served = 0;
  await context.route(
    "https://api.github.com/repos/o/r/git/blobs/**",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      served++;
      await route.fallback();
    },
  );
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  const label = await until(
    () => page.textContent(".git-panel .export-confirm"),
    (text) => /Уншиж байна… \d+ \/ 41/.test(text ?? ""),
    15000,
  );
  assert.match(label ?? "", /\/ 41/);
  await page.click(".git-panel .export-cancel");
  assert.equal(await page.locator(".git-panel").count(), 0);
  const stopped = served;
  await page.waitForTimeout(1500);
  assert.ok(served <= stopped + 6, served + " > " + stopped);
  assert.deepEqual(await rows(page), []);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("«Файл нээх» цэсийн «LaTeX төсөл» хэсгээс .tex файлгүйгээр Git repo нээнэ", async () => {
  const github = new FakeGithub({ "main.tex": MAIN, "ch.tex": "Нэг.\n" });
  const context = await app.context();
  await github.attach(context);
  const page = await openPage(app, context);
  await page.click("#openBtn");
  await page.locator(".project-menu-item", { hasText: "LaTeX төсөл" }).click();
  await page
    .locator(".project-menu-item", { hasText: "Git repo нээх" })
    .click();
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  assert.equal(await page.isVisible(".project-panel"), true);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("github.com, gitlab.com-оос өөр серверийн repo-г нээхгүй", async () => {
  const context = await app.context();
  let leaked = false;
  await context.route("https://git.example.org/**", (route) => {
    leaked = true;
    return route.abort();
  });
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill(
    '.git-panel input[name="repo"]',
    "https://git.example.org/o/r",
  );
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  const error = page.locator(".git-panel .export-error");
  await error.waitFor({ timeout: 5000 });
  assert.match(
    (await error.textContent()) ?? "",
    /github\.com болон gitlab\.com/,
  );
  assert.equal(
    await page.locator('.git-panel select[name="service"] option').count(),
    2,
  );
  assert.equal(leaked, false);
  await context.close();
});

test("нэг мөрийг хоёр талаас өөрчилбөл зөрчлийн цонхоор шийдэж commit хийнэ", async () => {
  const github = new FakeGithub({
    "main.tex": MAIN,
    "ch.tex": "Нэг.\nХоёр.\n",
  });
  const context = await app.context();
  await github.attach(context);
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  github.push({ "ch.tex": "Нэг бусдын.\nХоёр.\n" });
  await projectFile(page, "ch.tex");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(3, 3);
  });
  await page.keyboard.type(" миний");
  await commit(page, "Миний засвар");
  const pick = page.locator('.git-panel select[name="ch.tex#0"]');
  await pick.waitFor({ timeout: 15000 });
  assert.equal(
    await page.textContent(".git-panel .export-title"),
    "Зөрчлийг шийдвэрлэх",
  );
  assert.deepEqual(
    await page.locator(".git-panel .git-version-text").allTextContents(),
    ["Нэг миний.", "Нэг бусдын."],
  );
  await pick.selectOption("both");
  await page.click(".git-panel .export-confirm");
  await until(
    () => Promise.resolve(github.text("ch.tex")),
    (text) => text === "Нэг миний.\nНэг бусдын.\nХоёр.\n",
    15000,
  );
  assert.equal(github.text("ch.tex"), "Нэг миний.\nНэг бусдын.\nХоёр.\n");
  assert.equal(await editor(page), "Нэг миний.\nНэг бусдын.\nХоёр.\n");
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("татаж нэгтгэсний дараа commit бүтэлгүйдвэл засварлагч нэгтгэсэн бичвэрийг харуулж, дараагийн commit бусдын засварыг буцаахгүй", async () => {
  const github = new FakeGithub({
    "main.tex": MAIN,
    "ch.tex": "Нэг.\nХоёр.\n",
  });
  const context = await app.context();
  await github.attach(context);
  let refuse = true;
  await context.route(
    "https://api.github.com/repos/o/r/git/refs/heads/**",
    (route) => {
      if (route.request().method() === "PATCH" && refuse) {
        refuse = false;
        return route.fulfill({
          status: 422,
          headers: { "access-control-allow-origin": "*" },
          body: "{}",
        });
      }
      return route.fallback();
    },
  );
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.fill('.git-panel input[name="token"]', "tok");
  await page.click(".git-panel .export-confirm");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  github.push({ "ch.tex": "Нэг.\nХоёр.\nГурав бусдын.\n" });
  await projectFile(page, "ch.tex");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(3, 3);
  });
  await page.keyboard.type(" миний");
  await commit(page, "Эхний оролдлого");
  await until(
    () => editor(page),
    (text) => text === "Нэг миний.\nХоёр.\nГурав бусдын.\n",
    15000,
  );
  assert.equal(await editor(page), "Нэг миний.\nХоёр.\nГурав бусдын.\n");
  await until(
    () => status(page),
    (text) => text.includes("шинэ өөрчлөлт"),
    15000,
  );
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await commit(page, "Дахин");
  await until(
    () => Promise.resolve(github.text("ch.tex")),
    (text) => text?.includes("!") ?? false,
    15000,
  );
  assert.equal(github.text("ch.tex"), "Нэг миний.!\nХоёр.\nГурав бусдын.\n");
  await context.close();
});
