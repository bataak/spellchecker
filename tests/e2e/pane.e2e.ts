import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  chooseSlot,
  errors,
  openPage,
  reload,
  startApp,
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

const shown = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      el.getBoundingClientRect().width > 0
    );
  }, selector);

const resize = async (page: Page, width: number): Promise<void> => {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(400);
};

test("харагдац хажууд багтахгүй үед товчоор бичвэртэй сольж харуулна", async () => {
  const page = await openPage(app, await app.context());
  await chooseSlot(page, "Тайлан");
  await typeAtEnd(page, "# Гарчиг\n\nЭнэ бол **тод** үг.\n");

  for (const width of [700, 1280]) {
    await resize(page, width);
    assert.equal(await shown(page, ".preview-panel"), false);
    assert.equal(await shown(page, ".pane-toggle"), true, `товч ${width}`);
    await page.click(".pane-toggle");
    await until(
      () => page.locator(".preview-body").innerHTML(),
      (html) => html.includes("<h1"),
    );
    assert.equal(await shown(page, ".preview-panel"), true);
    assert.equal(await shown(page, ".editor-wrap"), false);
    await page.click(".pane-toggle");
    assert.equal(await shown(page, ".editor-wrap"), true);
    assert.equal(await shown(page, ".preview-panel"), false);
  }

  await page.click(".pane-toggle");
  await resize(page, 1920);
  assert.equal(await shown(page, ".pane-toggle"), false);
  assert.equal(await shown(page, ".editor-wrap"), true);
  assert.equal(await shown(page, ".preview-panel"), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.pane),
    undefined,
  );
  assert.deepEqual(errors(page), []);
});

test("гар утсан дээр харагдцад шилжихэд бичвэрт харагдаж байсан мөрийг харуулна", async () => {
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 390, height: 800 });
  await chooseSlot(page, "Тайлан");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = Array.from(
      { length: 80 },
      (_, i) => `Мөр ${i + 1}: Энэ бол туршилтын өгүүлбэр юм.`,
    ).join("\n\n");
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.blur();
  });
  await page.waitForTimeout(2200);
  const visible = await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.scrollTop = (area.scrollHeight - area.clientHeight) * 0.7;
    area.dispatchEvent(new Event("scroll"));
    const box = area.getBoundingClientRect();
    const numbers: number[] = [];
    const walker = document.createTreeWalker(
      document.querySelector("#backdrop")!,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const found of text.matchAll(/Мөр (\d+):/g)) {
        const range = document.createRange();
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        const rect = range.getBoundingClientRect();
        if (rect.top >= box.top && rect.bottom <= box.bottom)
          numbers.push(Number(found[1]));
      }
    }
    return numbers;
  });
  assert.ok(visible.length > 3 && visible[0]! > 30, `харагдсан: ${visible}`);
  await page.click(".pane-toggle");
  const marked = await until(
    () =>
      page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(".preview-body")!;
        const mark = body.querySelector<HTMLElement>(".sync-mark");
        if (!mark) return null;
        const at = mark.getBoundingClientRect();
        const frame = body.getBoundingClientRect();
        if (at.top < frame.top || at.bottom > frame.bottom) return null;
        const hit = [...body.querySelectorAll("p")].find((p) => {
          const rect = p.getBoundingClientRect();
          return rect.top < at.bottom && rect.bottom > at.top;
        });
        const found = /^Мөр (\d+):/.exec(hit?.textContent ?? "");
        return found ? Number(found[1]) : null;
      }),
    (value) => value !== null,
  );
  assert.ok(
    marked !== null && visible.includes(marked),
    `харагдацын мөр ${marked}, бичвэрт ${visible}`,
  );
  assert.deepEqual(errors(page), []);
});

test("хадгалсан тайлбарын самбарын байрлалтай ачаалахад унахгүй", async () => {
  for (const place of ["left", "right", "panel", "panel-top"]) {
    const page = await openPage(app, await app.context());
    await page.evaluate(
      (value) => localStorage.setItem("def-dock", value),
      place,
    );
    await reload(page);
    assert.deepEqual(errors(page), [], place);
    await page.close();
  }
});

test("LaTeX-ийг хэлбэржүүлэхэд харагдаж буй PDF арилж дахин зурагдахгүй", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await chooseSlot(page, "Судалгаа");
  const src =
    "\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item Нэг   \n\n\n\\item Хоёр\n\\end{itemize}\n\\end{document}\n";
  await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value = text;
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, src);
  await until(
    () => shown(page, ".preview-panel.has-pages canvas"),
    (on) => on,
    90000,
  );
  await page.waitForSelector(".tidy-btn:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win.first = document.querySelector(".preview-body canvas");
    win.gaps = 0;
    const tick = (): void => {
      if (!document.querySelector(".preview-panel.has-pages canvas"))
        win.gaps = (win.gaps as number) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click(".tidy-btn");
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    return {
      gaps: win.gaps,
      same: document.querySelector(".preview-body canvas") === win.first,
      text: document.querySelector<HTMLTextAreaElement>("#editor")!.value,
    };
  });
  assert.ok(after.text.includes("  \\item Нэг\n"), after.text);
  assert.equal(after.gaps, 0);
  assert.equal(after.same, true);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("LaTeX засах бүрд шинэ PDF-ийг хуучныхыг арилгалгүй сольж харуулна", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await chooseSlot(page, "Судалгаа");
  const doc = (word: string): string =>
    "\\documentclass{article}\n\\begin{document}\n" +
    Array.from({ length: 30 }, (_, i) =>
      i === 5 ? `Мөр ${word}.\n\n` : `Мөр ${i}.\n\n`,
    ).join("") +
    "\\end{document}\n";
  const set = (text: string): Promise<void> =>
    page.evaluate((value) => {
      const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
      area.value = value;
      area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }, text);
  await set(doc("нэг"));
  await until(
    () => shown(page, ".preview-panel.has-pages canvas"),
    (on) => on,
    90000,
  );
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win.first = document.querySelector(".preview-body canvas");
    win.gaps = 0;
    const tick = (): void => {
      if (
        !document.querySelector(
          ".preview-panel.has-pages .pdf-pages:not(.is-pending) canvas",
        )
      )
        win.gaps = (win.gaps as number) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await set(doc("хоёр"));
  const replaced = await until(
    () =>
      page.evaluate(() => {
        const win = window as unknown as Record<string, unknown>;
        return document.querySelector(".preview-body canvas") !== win.first;
      }),
    (on) => on,
    90000,
  );
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    gaps: (window as unknown as Record<string, unknown>).gaps,
    lists: document.querySelectorAll(".preview-body .pdf-pages").length,
  }));
  assert.equal(replaced, true);
  assert.equal(after.gaps, 0);
  assert.equal(after.lists, 1);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("гар горимд засвар хийсний дараа ч сум хуучин PDF дээр синк хийнэ", async () => {
  const context = await app.context();
  const page = await openPage(app, context);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await chooseSlot(page, "Судалгаа");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value =
      "\\documentclass{article}\n\\begin{document}\n" +
      Array.from(
        { length: 12 },
        (_, i) => `Энэ бол ${i + 1}-р догол мөр бөгөөд туршилтын өгүүлбэр.\n\n`,
      ).join("") +
      "\\end{document}\n";
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await until(
    () => shown(page, ".preview-panel.has-pages canvas"),
    (on) => on,
    90000,
  );
  await page.click(".tex-compile:not(.tex-download)");
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    const at = area.value.indexOf("5-р");
    area.setSelectionRange(at, at);
  });
  await page.keyboard.type("а");
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win.marks = 0;
    win.on = false;
    new MutationObserver(() => {
      const mark = document.querySelector(".sync-mark:not(.is-fading)");
      if (mark && !win.on) win.marks = (win.marks as number) + 1;
      win.on = !!mark;
    }).observe(document.querySelector(".preview-body")!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1200);
  const marks = await page.evaluate(
    () => (window as unknown as Record<string, number>).marks!,
  );
  const manual = await page.evaluate(
    () =>
      !document
        .querySelector(".tex-compile:not(.tex-download)")!
        .classList.contains("is-auto"),
  );
  assert.equal(manual, true);
  assert.equal(marks, 1);
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("үсгийг томруулсан ч харагдацад # гарчиг ##-аас, ## нь ###-аас том", async () => {
  const page = await openPage(app, await app.context());
  await resize(page, 1600);
  await chooseSlot(page, "Өргөдөл");
  await typeAtEnd(page, "# Нэг\n\n## Хоёр\n\n### Гурав\n");
  await until(
    () => page.locator(".preview-body").innerHTML(),
    (html) => html.includes("<h3"),
  );
  const sizes = await page.evaluate(() => {
    document.documentElement.style.setProperty("--editor-scale", "1.3");
    return ["h1", "h2", "h3"].map((tag) =>
      parseFloat(
        getComputedStyle(document.querySelector(".preview-body " + tag)!)
          .fontSize,
      ),
    );
  });
  assert.ok(sizes[0]! > sizes[1]! && sizes[1]! > sizes[2]!, String(sizes));
  assert.deepEqual(errors(page), []);
});
