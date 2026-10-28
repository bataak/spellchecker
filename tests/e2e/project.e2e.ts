import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  answer,
} from "./harness.ts";

const HAS_DEFINITIONS = existsSync(
  new URL("../../public/dict/stardict", import.meta.url),
);

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

  await page.click("#clearBtn");
  await answer(page, "Болих");
  await page.waitForTimeout(600);
  assert.match(await editor(page), /documentclass[\s\S]*%засвар$/);

  await page.click("#clearBtn");
  await answer(page, "Хаах");
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

test("төслийн самбар багтах хилийн орчимд preview алга болохгүй", async () => {
  const context = await app.context();
  const seed = await openPage(app, context);
  await openFile(seed, app.files.project);
  await projectFile(seed, "main.tex");
  await seed.close();
  for (let width = 1690; width <= 1790; width += 10) {
    const page = await openPage(app, context);
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.waitForSelector("#editor");
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>(".preview-panel");
      return {
        docked: !("projectFloat" in document.documentElement.dataset),
        project: document.documentElement.dataset.project === "on",
        preview: !!preview && preview.offsetParent !== null,
      };
    });
    if (state.project && state.docked)
      assert.equal(state.preview, true, String(width));
    await page.close();
  }
});

test("том төсөлд Ctrl+Shift дарж заасан үгийн тайлбар гацалтгүй гарна", async () => {
  const page = await openPage(app, await app.context());
  await openFile(page, app.files.big);
  await page.click("#editor");
  await page.waitForTimeout(3000);
  const points = await page.evaluate(() => {
    const out: { x: number; y: number }[] = [];
    const root = document.querySelector("#editor")!.parentElement!;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node && out.length < 5;) {
      const at = node.textContent!.indexOf("дүрэм");
      if (at >= 0) {
        const range = document.createRange();
        range.setStart(node, at + 2);
        range.setEnd(node, at + 3);
        const box = range.getBoundingClientRect();
        if (box.width)
          out.push({ x: box.left + box.width / 2, y: box.top + 4 });
      }
      node = walk.nextNode();
    }
    return out;
  });
  assert.ok(points.length >= 3);
  const tipWord = () =>
    page.evaluate(
      () => document.querySelector(".def-tip .def-tip-hw")?.textContent ?? "",
    );
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.move(points[0]!.x, points[0]!.y);
  if (HAS_DEFINITIONS)
    assert.match(
      await until(tipWord, (text) => /дүрэм/i.test(text), 10000),
      /дүрэм/i,
    );
  else await page.waitForTimeout(1000);
  const watching = await page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask"))
      return false;
    const longest = { ms: 0 };
    (window as unknown as Record<string, unknown>).__longest = longest;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        longest.ms = Math.max(longest.ms, entry.duration);
    }).observe({ type: "longtask" });
    return true;
  });
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(300);
    if (HAS_DEFINITIONS) assert.match(await tipWord(), /дүрэм/i);
  }
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  if (!watching) return;
  const longest = await page.evaluate(
    () => (window as unknown as Record<string, { ms: number }>).__longest!.ms,
  );
  assert.ok(longest < 60, `${Math.round(longest)} мс`);
});
