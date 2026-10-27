import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseProject,
  chooseSlot,
  editor,
  openFile,
  openPage,
  projectDirty,
  projectFile,
  startApp,
  status,
  typeAtEnd,
  until,
  type App,
} from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

test("Бичвэр цонх уруу шилжихэд нээлттэй .sty файл хоосрохгүй", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Бичвэр нэгийн агуулга");
  await openFile(page, app.files.project);
  await projectFile(page, "mystyle.sty");
  await chooseSlot(page, "Бичвэр 1");
  assert.equal(await editor(page), "Бичвэр нэгийн агуулга");
  await chooseProject(page);
  assert.ok((await editor(page)).startsWith("% mystyle"));
  assert.deepEqual(await projectDirty(page), []);

  await typeAtEnd(page, "\n% нэмсэн мөр");
  await chooseSlot(page, "Бичвэр 2");
  await chooseProject(page);
  assert.ok((await editor(page)).endsWith("% нэмсэн мөр"));
});

test("файл хаахад цэс товчныхоо доор үлдэнэ", async () => {
  const page = await openPage(app, await app.context());
  for (const file of [app.files.a, app.files.b, app.files.docx])
    await openFile(page, file);
  await page.click("#editor");
  await page.waitForTimeout(400);
  await page.click(".md-template");
  for (let i = 0; i < 2; i += 1) {
    await page.locator(".md-menu-close").first().click();
    await page.waitForTimeout(800);
    const [menu, button] = await page.evaluate(() => [
      document.querySelector(".md-menu")!.getBoundingClientRect().left,
      document.querySelector(".md-template")!.getBoundingClientRect().left,
    ]);
    assert.ok(Math.abs(menu - button) < 40, `${menu} vs ${button}`);
  }
});

test("төслийн файлыг хоосолсны дараа хэвлэх алдааг хэлнэ", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await page.waitForTimeout(3000);
  await page.click("#editor");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(1000);
  await page.click("#printBtn");
  const label = await until(
    () =>
      page.evaluate(() => document.querySelector("#printBtn")!.textContent!),
    (text) => /чадсангүй/.test(text),
    30000,
  );
  assert.match(label, /Хэвлэж чадсангүй/);
  assert.match(await status(page), /PDF үүсгэж чадсангүй/);
});

test("LaTeX командын хаалтуудын хооронд Tab-аар шилжинэ", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await projectFile(page, "main.tex");
  await typeAtEnd(page, "$\\frac");
  await page.waitForSelector(".tex-complete:not([hidden])");
  await page.keyboard.press("Tab");
  await page.keyboard.type("a");
  await page.keyboard.press("Tab");
  await page.keyboard.type("b");
  await page.keyboard.press("Tab");
  await page.keyboard.type("$");
  assert.ok(
    (await editor(page)).endsWith("$\\frac{a}{b}$"),
    await editor(page),
  );
  await page.keyboard.press("Tab");
  assert.notEqual(
    await page.evaluate(() => document.activeElement?.id),
    "editor",
  );
});

test("LaTeX горимд $-ийг хос болгож, \\$-ийг ганцаар нь үлдээнэ", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await projectFile(page, "main.tex");
  await typeAtEnd(page, "$x");
  assert.ok((await editor(page)).endsWith("$x$"), await editor(page));
  await page.keyboard.type("$ $$y");
  assert.ok((await editor(page)).endsWith("$x$ $$y$$"), await editor(page));
  await page.keyboard.press("Tab");
  await page.keyboard.type(" \\$5");
  assert.ok(
    (await editor(page)).endsWith("$x$ $$y$$ \\$5"),
    await editor(page),
  );
  await page.keyboard.press("Control+z");
  assert.ok(!(await editor(page)).endsWith("\\$5"));
});

test("хоосон $$ болон \\[ дээр Enter томьёог тусдаа мөрөнд задална", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await projectFile(page, "main.tex");
  await typeAtEnd(page, "$$");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("\\[");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  await page.keyboard.press("Tab");
  assert.ok(
    (await editor(page)).endsWith("$$\n  a\n$$\n\\[\n  b\n\\]"),
    JSON.stringify(await editor(page)),
  );
});

test("\\ref дотор шошгыг, өөр файлын командыг санал болгоно", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await projectFile(page, "main.tex");
  await typeAtEnd(page, "\n\\label{sec:intro} \\ref{sec");
  await page.waitForSelector(".tex-complete:not([hidden])");
  assert.equal(
    await page.textContent(".tex-complete li .tc-name"),
    "sec:intro",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.type("} \\hel");
  await page.waitForSelector(".tex-complete:not([hidden])");
  assert.equal(await page.textContent(".tex-complete li .tc-name"), "\\hello");
  assert.ok(
    (await editor(page)).endsWith("\\ref{sec:intro} \\hel"),
    await editor(page),
  );
});

test("LaTeX мөрөөр сонголтыг тодруулж, тэмдэг ба орчин оруулна", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.project);
  await projectFile(page, "main.tex");
  await typeAtEnd(page, "\nсайн");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.click('.tex-btn[data-tool="bold"]');
  assert.ok(
    (await editor(page)).endsWith("са\\textbf{йн}"),
    await editor(page),
  );
  await page.keyboard.press("Tab");
  await page.keyboard.type(" $");
  await page.click('.tex-btn[data-tool="symbols"]');
  await page.click('.tex-pop .tex-cell[data-command="alpha"]');
  assert.ok((await editor(page)).endsWith("$\\alpha$"), await editor(page));
  await page.keyboard.press("Tab");
  await page.keyboard.type("\n\\begin{quote}\nx\n");
  await page.keyboard.press("Escape");
  await page.click('.tex-btn[data-tool="close"]');
  assert.ok(
    (await editor(page)).endsWith("$\\alpha$\n\\begin{quote}\nx\n\\end{quote}"),
    await editor(page),
  );
  await page.click('.tex-btn[data-tool="env"]');
  await page.click('.tex-pop .tex-item >> text="Голлуулах"');
  await page.keyboard.type("y");
  assert.ok(
    (await editor(page)).endsWith("\\begin{center}\n  y\n\\end{center}"),
    await editor(page),
  );
});

test("төсөлд байхад Цэвэрлэх товч төслийг асууж байгаад хаана", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Өмнөх бичвэр");
  await openFile(page, app.files.project);
  await typeAtEnd(page, "%засвар");
  const hasProject = (): Promise<boolean> =>
    page.evaluate(
      () =>
        !!document.querySelector('.md-menu-item[data-value="project"]') ||
        (document.querySelector(".md-template")?.textContent ?? "").includes(
          "төсөл",
        ),
    );

  await page.evaluate(() => {
    window.confirm = () => false;
  });
  await page.click("#clearBtn");
  await page.waitForTimeout(600);
  assert.match(await editor(page), /documentclass[\s\S]*%засвар$/);

  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.click("#clearBtn");
  assert.equal(
    await until(
      () => editor(page),
      (text) => text === "Өмнөх бичвэр",
    ),
    "Өмнөх бичвэр",
  );
  await page.click("#editor");
  await page.waitForTimeout(400);
  await page.click(".md-template");
  await page.waitForTimeout(300);
  assert.equal(await hasProject(), false);
});
