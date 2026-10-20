import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  errors,
  openFile,
  openPage,
  projectFile,
  reload,
  startApp,
  until,
  type App,
} from "./harness.ts";
import { FakeGithub } from "../helpers/fakegithub.ts";
import { FakeGitlab, GITLAB_PROJECT } from "../helpers/fakegitlab.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const MAIN =
  "\\documentclass{article}\n\\begin{document}\n\\input{ch}\n\\end{document}\n";

const rows = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".project-row")].map(
      (row) => row.dataset.path ?? "",
    ),
  );

const openPanel = async (page: Page): Promise<void> => {
  const local = join(mkdtempSync(join(tmpdir(), "git-e2e-")), "local.tex");
  writeFileSync(local, MAIN);
  await openFile(page, local);
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".project-panel");
    if (!panel || panel.hidden)
      document.querySelector<HTMLElement>(".project-toggle")?.click();
  });
  await page.locator(".project-open", { hasText: "Git repo-оос нээх" }).click();
};

const commit = async (page: Page, message?: string): Promise<void> => {
  await page.keyboard.press("Control+s");
  const area = page.locator(".git-panel textarea");
  await area.waitFor({ timeout: 10000 });
  if (message !== undefined) await area.fill(message);
  await page.click(".git-panel .export-confirm");
};

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

test("өөрийн GitLab серверээс дэд бүлгийн төсөл нээж commit хийнэ", async () => {
  const gitlab = new FakeGitlab({
    "README.md": "readme",
    "tex/main.tex": MAIN,
    "tex/ch.tex": "Бүлэг нэг.\n",
  });
  const context = await app.context();
  await gitlab.attach(context);
  const page = await openPage(app, context);
  await openPanel(page);
  await page.selectOption('.git-panel select[name="provider"]', "gitlab");
  await page.fill('.git-panel input[name="host"]', gitlab.host);
  await page.fill('.git-panel input[name="repo"]', GITLAB_PROJECT);
  await page.fill('.git-panel input[name="dir"]', "tex");
  await page.fill('.git-panel input[name="token"]', "glpat");
  const help = await page.getAttribute(".git-note a", "href");
  assert.equal(help, gitlab.host + "/-/user_settings/personal_access_tokens");
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
