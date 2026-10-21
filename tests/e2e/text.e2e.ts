import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  FIREFOX,
  chooseSlot,
  editor,
  errors,
  openPage,
  reload,
  settle,
  startApp,
  typeAtEnd,
  until,
  type App,
  ready,
} from "./harness.ts";

let app: App;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});

const composed = (text: string): boolean =>
  text === text.normalize("NFC") && /[йЁ]/.test(text);

test("задарсан й, ё-г шивэх, буулгах, чирэх бүх замд нийлүүлнэ", async () => {
  const page = await openPage(app, await app.context({ clipboard: true }));
  await page.click("#editor");
  for (const ch of "Сайн байна".normalize("NFD"))
    if (ch === " ") await page.keyboard.type(ch);
    else await page.keyboard.insertText(ch);
  await page.keyboard.type(" ");
  assert.ok(composed(await editor(page)), await editor(page));

  if (FIREFOX) {
    await page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      "Ёс ".normalize("NFD"),
    );
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Control+V");
  } else
    await page.evaluate((text) => {
      const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
      area.setSelectionRange(area.value.length, area.value.length);
      const data = new DataTransfer();
      data.setData("text/plain", text);
      area.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, "Ёс ".normalize("NFD"));
  await page.evaluate(
    (text) => navigator.clipboard.writeText(text),
    "Ёслол ".normalize("NFD"),
  );
  await page.click("#pasteBtn");
  await until(
    () => editor(page),
    (value) => value.includes("Ёслол"),
  );
  await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    const at = area.value.length;
    area.setRangeText(text, at, at, "select");
    area.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertFromDrop" }),
    );
  }, "Ёстой".normalize("NFD"));
  await settle(page);
  const text = await editor(page);
  assert.equal(text, "Сайн байна Ёс Ёслол Ёстой");
  assert.ok(composed(text));
  assert.deepEqual(
    await page.evaluate(() => document.querySelectorAll(".ew").length),
    0,
  );
  assert.deepEqual(errors(page), []);
});

test("засварлагч зөвхөн уншихад буулгалт бичвэрийг өөрчлөхгүй", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Сайн");
  const changed = await page.evaluate((text) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    const before = area.value;
    area.readOnly = true;
    const data = new DataTransfer();
    data.setData("text/plain", text);
    area.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return area.value !== before;
  }, "бӑйна");
  assert.equal(changed, false);
});

test("алдаатай үгийн чип давталтуудаар ээлжлэн шилжинэ", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "mmsm\nmmsm\nmmsm\n");
  await page.waitForSelector(".ew", { timeout: 30000 });
  const picks: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    await page.click(".ew");
    await page.waitForTimeout(300);
    picks.push(
      await page.evaluate(
        () =>
          document.querySelector<HTMLTextAreaElement>("#editor")!
            .selectionStart,
      ),
    );
  }
  assert.deepEqual(picks, [0, 5, 10, 0]);
});

test("санал сонгох, undo хийх, алгассан үг дахин ачаалахад хадгалагдах", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Монгол хэлний алдаатй үг. Ххүрэлбаатарын ном.\n");
  await page.waitForSelector(".ew", { timeout: 30000 });
  await page.locator(".ew", { hasText: "алдаатй" }).click();
  await page
    .locator(".sg:not(.sg-ignore, .sg-manual)", { hasText: "алдаатай" })
    .first()
    .click();
  assert.match(
    await until(
      () => editor(page),
      (t) => t.includes("алдаатай"),
    ),
    /алдаатай үг/,
  );
  await page.keyboard.press("ControlOrMeta+z");
  assert.match(
    await until(
      () => editor(page),
      (t) => t.includes("алдаатй"),
    ),
    /алдаатй үг/,
  );

  await page.locator(".ew", { hasText: "Ххүрэлбаатарын" }).click();
  await page.locator(".sg-ignore").click();
  await settle(page);
  await reload(page);
  const chips = await until(
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".ew")].map((chip) => chip.textContent),
      ),
    (list) => list.length > 0,
    30000,
  );
  assert.deepEqual(chips, ["алдаатй"]);
});

test("гараар зассан алдаатай үгийг бусад давталтад тараана", async () => {
  const page = await openPage(app, await app.context());
  await typeAtEnd(page, "Би байнаа. Тэр байнаа гэж хэлэв.\n");
  await page.waitForSelector(".ew", { timeout: 30000 });
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(9, 9);
  });
  await page.keyboard.press("Backspace");
  assert.equal(
    await until(
      () => editor(page),
      (text) => text === "Би байна. Тэр байна гэж хэлэв.\n",
      10000,
    ),
    "Би байна. Тэр байна гэж хэлэв.\n",
  );
  assert.deepEqual(errors(page), []);
});

test("LaTeX-д монгол байрлалын ьь-г шууд, вв-г зайны дараа « » болгож, Backspace дарвал буцаана", async () => {
  const context = await app.context();
  await context.addInitScript(() =>
    localStorage.setItem("keyboard-layout", "mn"),
  );
  const page = await openPage(app, context);
  await chooseSlot(page, "Судалгаа");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.value =
      "\\documentclass{article}\n\\begin{document}\nБ:\n\\end{document}\n";
    area.dispatchEvent(new InputEvent("input", { bubbles: true }));
    area.focus();
    const at = area.value.indexOf("Б:") + 2;
    area.setSelectionRange(at, at);
  });
  await page.waitForTimeout(500);
  const line = (): Promise<string> =>
    page.evaluate(() => {
      const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
      return area.value.slice(area.value.indexOf("Б:"), area.selectionStart);
    });
  const press = async (...keys: string[]): Promise<void> => {
    for (const key of keys) await page.keyboard.press(key);
  };
  await press("Space", "Comma", "Comma");
  assert.equal(await line(), "Б: «");
  await press("Backspace");
  assert.equal(await line(), "Б: ьь");
  await press("Comma");
  assert.equal(await line(), "Б: ььь");
  await press("Backspace", "Backspace", "Backspace");
  await press("Comma", "Comma", "KeyN", "Period", "Period");
  assert.equal(await line(), "Б: «ивв");
  await press("Space");
  assert.equal(await line(), "Б: «и» ");
  await press("Backspace");
  assert.equal(await line(), "Б: «ивв ");
  assert.deepEqual(errors(page), []);
  await context.close();
});

test("утсан дээр toolbar-ыг төгсгөл рүү гүйлгэхэд «Файл нээх» товч бүтэн харагдана", async () => {
  const context = await app.browser.newContext({
    viewport: { width: 390, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(app.url);
  await ready(page);
  await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".toolbar")!;
    bar.scrollLeft = bar.scrollWidth - bar.clientWidth - 30;
  });
  const gap = await until(
    () =>
      page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>(".toolbar")!;
        const end = document.querySelector<HTMLElement>("#openBtn")!;
        return (
          end.getBoundingClientRect().right - bar.getBoundingClientRect().right
        );
      }),
    (value) => Math.abs(value) <= 1,
    3000,
  );
  assert.ok(Math.abs(gap) <= 1, String(gap));
  await context.close();
});
