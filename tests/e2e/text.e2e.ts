import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  editor,
  errors,
  openPage,
  ready,
  reload,
  settle,
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

const composed = (text: string): boolean =>
  text === text.normalize("NFC") && /[йЁ]/.test(text);

test("задарсан й, ё-г шивэх, буулгах, чирэх бүх замд нийлүүлнэ", async () => {
  const page = await openPage(app, await app.context({ clipboard: true }));
  await page.click("#editor");
  for (const ch of "Сайн байна".normalize("NFD"))
    await page.keyboard.insertText(ch);
  await page.keyboard.type(" ");
  assert.ok(composed(await editor(page)), await editor(page));

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

test("зөвхөн шинэчлэлийн дараах reload бүдгэрнэ", async () => {
  const page = await openPage(app, await app.context());
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      sessionStorage.setItem(
        "e2e:blurred",
        String(document.documentElement.classList.contains("settling")),
      );
    });
  });
  const blurred = (): Promise<string | null> =>
    page.evaluate(() => sessionStorage.getItem("e2e:blurred"));
  await reload(page);
  assert.equal(await blurred(), "false");
  await page.evaluate(() =>
    sessionStorage.setItem("mn-spell:update-reload", "1"),
  );
  await reload(page);
  assert.equal(await blurred(), "true");
  const cleared = await until(
    () =>
      page.evaluate(
        () => !document.documentElement.classList.contains("settling"),
      ),
    (done) => done,
  );
  assert.equal(cleared, true);
  await reload(page);
  assert.equal(await blurred(), "false");
});

test("SW-гүй shift+reload бүдгэрнэ, шинээр нээхэд бүдгэрэхгүй", async () => {
  const page = await openPage(app, await app.context());
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      sessionStorage.setItem(
        "e2e:blurred",
        String(document.documentElement.classList.contains("settling")),
      );
    });
  });
  const blurred = (): Promise<string | null> =>
    page.evaluate(() => sessionStorage.getItem("e2e:blurred"));
  // Dev сервер SW-гүй тул өмнө нь удирдагдаж байсныг дуурайна.
  await page.evaluate(() =>
    sessionStorage.setItem("mn-spell:sw-controlled", "1"),
  );
  await reload(page);
  assert.equal(await blurred(), "true");
  await page.goto(app.url);
  await ready(page);
  assert.equal(await blurred(), "false");
});
