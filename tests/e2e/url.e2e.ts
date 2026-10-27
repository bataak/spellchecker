import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  FIREFOX,
  chooseSlot,
  editor,
  errors,
  openFile,
  openPage,
  ready,
  slotLabel,
  startApp,
  status,
  typeAtEnd,
  until,
  type App,
} from "./harness.ts";
import { textHash } from "../../src/files/textlink.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const hashOf = (page: Page): Promise<string> =>
  page.evaluate(() => decodeURIComponent(location.hash));

async function visit(page: Page, hash: string): Promise<void> {
  await page.goto(app.url + hash);
  await ready(page);
}

async function openedAs(page: Page, label: string): Promise<void> {
  const shown = await until(
    async () =>
      (await slotLabel(page)) +
      " " +
      ((await page.getAttribute("#saveBtn", "title")) ?? ""),
    (text) => text.includes(label),
  );
  assert.ok(shown.includes(label), shown);
  assert.equal(await hashOf(page), "");
}

test("хэшээр талбар нээгдэж, хаягийн мөрөнд хэш үлдэхгүй", async () => {
  const page = await openPage(app, await app.context());
  assert.equal(await hashOf(page), "");
  await chooseSlot(page, "Бичвэр 2");
  assert.equal(await hashOf(page), "");

  await page.evaluate(() => {
    location.hash = "#letter/minutes";
  });
  await openedAs(page, "Хурлын тэмдэглэл");
  await page.evaluate(() => {
    location.hash = "#letter/application";
  });
  await openedAs(page, "Өргөдөл");

  await openFile(page, app.files.a);
  await visit(page, "#plain2");
  await openedAs(page, "Бичвэр 2");
  await visit(page, "#file/a.txt");
  await openedAs(page, "a.txt");
  assert.equal(await editor(page), "Файл А\n");
  await visit(page, "#file/алга.md");
  assert.match(await status(page), /нээлттэй биш/);
  assert.deepEqual(errors(page), []);
});

test("бичвэртэй холбоос шинэ файлд нээгдэж, хэш цэвэрлэгдэнэ", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Хуучин бичвэр");
  const hash = await textHash("Холбоосоор ирсэн бичвэр", "ирсэн.md");
  await visit(page, hash!);
  assert.equal(
    await until(
      () => editor(page),
      (text) => text === "Холбоосоор ирсэн бичвэр",
    ),
    "Холбоосоор ирсэн бичвэр",
  );
  await openedAs(page, "ирсэн.md");
  await chooseSlot(page, "Бичвэр 1");
  assert.equal(await editor(page), "Хуучин бичвэр");
  assert.deepEqual(errors(page), []);
});

test(
  "Shift + Хуулах товч талбарын холбоосыг, дараа нь бичвэртэй холбоосыг хуулна",
  { skip: FIREFOX && "clipboard зөвшөөрөл" },
  async () => {
    const page = await openPage(app, await app.context({ clipboard: true }));
    await typeAtEnd(page, "Хуулах бичвэр");
    await page.click("#copyBtn", { modifiers: ["Shift"] });
    const clip = (): Promise<string> =>
      page.evaluate(() => navigator.clipboard.readText());
    assert.equal(
      await until(clip, (text) => text.endsWith("#plain")),
      app.url + "#plain",
    );
    await page.click(".snackbar-action");
    const linked = await until(clip, (text) => text.includes("#text="));
    assert.ok(linked.startsWith(app.url + "#text="));
    assert.match(
      (await page.textContent(".snackbar-text")) ?? "",
      /нууцлалгүй агуулагдаж/,
    );
    await visit(page, linked.slice(app.url.length));
    assert.equal(
      await until(
        () => editor(page),
        (text) => text === "Хуулах бичвэр",
      ),
      "Хуулах бичвэр",
    );
    await openedAs(page, "бичвэр.txt");

    await visit(page, "#letter/minutes");
    await openedAs(page, "Хурлын тэмдэглэл");
    await page.click("#copyBtn", { modifiers: ["Shift"] });
    assert.equal(
      await until(clip, (text) => text.endsWith("#letter/minutes")),
      app.url + "#letter/minutes",
    );
    assert.equal(await hashOf(page), "");
  },
);

const TEX =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";

const markdownMode = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      !!document
        .querySelector("#editor")
        ?.parentElement?.classList.contains("is-markdown"),
  );

test("GitHub файлын холбоосоор файл нээж, хавтасны холбоосыг татгалзана", async () => {
  const context = await app.context();
  const requests: string[] = [];
  await context.route("https://raw.githubusercontent.com/**", (route) => {
    requests.push(route.request().url());
    void route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: route.request().url().endsWith(".tex") ? TEX : "Алсын \u202Eфайл",
    });
  });
  const page = await openPage(app, context);
  await visit(
    page,
    "#url=https://github.com/u/r/blob/main/docs/%D0%B0%D0%BB%D1%81.md",
  );
  assert.equal(
    await until(
      () => editor(page),
      (text) => text === "Алсын файл",
    ),
    "Алсын файл",
  );
  assert.deepEqual(requests, [
    "https://raw.githubusercontent.com/u/r/main/docs/%D0%B0%D0%BB%D1%81.md",
  ]);
  await openedAs(page, "алс.md");
  assert.equal(await markdownMode(page), true);
  assert.equal(await page.isVisible(".tex-compile"), false);

  await visit(page, "#url=https://github.com/u/r/blob/main/a.tex");
  assert.equal(
    await until(
      () => editor(page),
      (text) => text === TEX,
    ),
    TEX,
  );
  await page.waitForSelector(".tex-compile:not([hidden])", {
    state: "visible",
    timeout: 30000,
  });
  assert.equal(await markdownMode(page), false);

  await visit(page, "#url=https://github.com/u/r/tree/main/docs");
  assert.match(
    await until(
      () => status(page),
      (s) => s.includes("хавтас"),
    ),
    /хавтас/,
  );
  await visit(page, "#url=https://github.com.evil.com/u/r/blob/main/a.md");
  assert.match(
    await until(
      () => status(page),
      (s) => s.includes("https"),
    ),
    /GitHub, GitLab/,
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(errors(page), []);
});
