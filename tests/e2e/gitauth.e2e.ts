import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import {
  errors,
  openFile,
  openPage,
  startApp,
  until,
  type App,
} from "./harness.ts";
import { FakeGithub } from "../helpers/fakegithub.ts";
import { FakeGitlab, GITLAB_PROJECT } from "../helpers/fakegitlab.ts";

process.env.VITE_GIT_AUTH_URL = "https://auth.test";
process.env.VITE_GITHUB_CLIENT_ID = "gh-client";
process.env.VITE_GITLAB_CLIENT_ID = "gl-client";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const rows = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".project-row")].map(
      (row) => row.dataset.path ?? "",
    ),
  );

const openDialog = async (page: Page): Promise<void> => {
  const local = join(mkdtempSync(join(tmpdir(), "auth-e2e-")), "local.tex");
  writeFileSync(local, MAIN);
  await openFile(page, local);
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".project-panel");
    if (!panel || panel.hidden)
      document.querySelector<HTMLElement>(".project-toggle")?.click();
  });
  await page.locator(".project-open", { hasText: "Git repo нээх" }).click();
};

const openMore = async (page: Page): Promise<void> => {
  if ((await page.getAttribute(".git-more", "open")) === null)
    await page.click(".git-more > summary");
};

const fakeGitlabLogin = async (context: BrowserContext) => {
  const seen: { challenge?: string; verified?: boolean } = {};
  await context.route("https://gitlab.com/oauth/authorize**", (route) => {
    const url = new URL(route.request().url());
    seen.challenge = url.searchParams.get("code_challenge") ?? "";
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", "abc");
    back.searchParams.set("state", url.searchParams.get("state")!);
    return route.fulfill({ status: 302, headers: { location: back.href } });
  });
  await context.route("https://gitlab.com/oauth/token", (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS, body: "" });
    const body = new URLSearchParams(route.request().postData() ?? "");
    const challenge = createHash("sha256")
      .update(body.get("code_verifier") ?? "")
      .digest("base64url");
    seen.verified =
      body.get("code") === "abc" &&
      body.get("client_id") === "gl-client" &&
      challenge === seen.challenge;
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({
        access_token: "glo",
        refresh_token: "r",
        expires_in: 7200,
      }),
    });
  });
  return seen;
};

test("GitLab-аар нэвтрэх товчоор token оруулахгүйгээр төсөл нээнэ", async () => {
  const gitlab = new FakeGitlab(
    { "tex/main.tex": MAIN, "tex/ch.tex": "Нэг.\n" },
    "https://gitlab.com",
  );
  const context = await app.context();
  await gitlab.attach(context);
  const seen = await fakeGitlabLogin(context);
  const page = await openPage(app, context);
  await openDialog(page);
  await page.selectOption('.git-panel select[name="service"]', "gitlab");
  assert.equal(await page.isVisible('.git-panel input[name="token"]'), false);
  assert.equal(await page.isVisible('.git-panel input[name="host"]'), false);
  await page.fill('.git-panel input[name="repo"]', GITLAB_PROJECT);
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "tex");
  const button = page.locator(".git-signin-btn");
  assert.equal(await button.textContent(), "Нэвтрэх");
  await button.click();
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  assert.equal(seen.verified, true);
  assert.ok(gitlab.tokens.every((token) => token === "Bearer glo"));
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("GitHub-ээр нэвтрэхэд код харуулж, зөвшөөрмөгц төсөл нээнэ", async () => {
  const github = new FakeGithub({ "main.tex": MAIN, "ch.tex": "Нэг.\n" });
  const context = await app.context();
  await github.attach(context);
  let polls = 0;
  await context.route("https://auth.test/github/device/**", (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS, body: "" });
    const body = route.request().postDataJSON() as Record<string, string>;
    const reply = route.request().url().endsWith("/code")
      ? {
          device_code: "dev",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          interval: 1,
        }
      : ++polls < 2
        ? { error: "authorization_pending" }
        : { access_token: "gho" };
    assert.equal(body.client_id, "gh-client");
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(reply),
    });
  });
  const page = await openPage(app, context);
  await openDialog(page);
  await page.selectOption('.git-panel select[name="service"]', "github");
  await page.fill('.git-panel input[name="repo"]', "o/r");
  await openMore(page);
  await page.fill('.git-panel input[name="dir"]', "");
  await page.locator(".git-signin-btn").click();
  await page.locator(".git-code").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".git-code").textContent(), "ABCD-1234");
  await until(
    () => rows(page),
    (paths) => paths.includes("ch.tex"),
    20000,
  );
  assert.ok(github.tokens.every((token) => token === "Bearer gho"));
  assert.deepEqual(errors(page), []);
  await context.close();
});
