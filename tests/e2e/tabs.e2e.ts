import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseSlot,
  editor,
  openFile,
  openPage,
  projectFile,
  reload,
  settle,
  slotLabel,
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

test("хоёр таб өөр цонхны бичвэрийг дарж бичихгүй", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  await typeAtEnd(a, "ААА");
  await settle(a);
  const b = await openPage(app, context);
  await chooseSlot(b, "Бичвэр 2");
  await typeAtEnd(b, "БББ");
  await settle(b);
  await a.bringToFront();
  await typeAtEnd(a, " нэмэлт");
  await settle(a);
  await reload(a);
  assert.equal(await slotLabel(a), "Бичвэр 1");
  assert.equal(await editor(a), "ААА нэмэлт");
  await chooseSlot(a, "Бичвэр 2");
  assert.equal(await editor(a), "БББ");
});

test("хоёр табад нээсэн файлууд хоёулаа жагсаалтад үлдэнэ", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  const b = await openPage(app, context);
  await openFile(a, app.files.a);
  await openFile(b, app.files.b);
  await reload(a);
  const names = await a.evaluate(() =>
    (JSON.parse(localStorage.getItem("mdFiles") ?? "[]") as { name: string }[])
      .map((slot) => slot.name)
      .sort(),
  );
  assert.deepEqual(names, ["a.txt", "b.txt"]);
});

test("өөр табад хаасан файлын дугаар дахин олгогдохгүй", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  await openFile(a, app.files.a);
  const b = await openPage(app, context);
  const first = await b.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("mdFiles")!) as { id: string }[])[0]!.id,
  );
  await b.click("#editor");
  await b.waitForTimeout(400);
  await b.click(".md-template");
  await b.evaluate(
    (id) =>
      document
        .querySelector<HTMLElement>(`.md-menu-close[data-close="${id}"]`)
        ?.click(),
    first,
  );
  await b.keyboard.press("Escape");
  await openFile(b, app.files.b);
  const ids = await b.evaluate(() =>
    (JSON.parse(localStorage.getItem("mdFiles")!) as { id: string }[]).map(
      (slot) => slot.id,
    ),
  );
  assert.ok(!ids.includes(first), ids.join());
});

test("загварын жишээний сонголт таб бүрт тусдаа", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  await chooseSlot(a, "Өргөдөл");
  await typeAtEnd(a, " А-ГИЙН");
  await settle(a);
  const b = await openPage(app, context);
  await chooseSlot(b, "Хурлын тэмдэглэл");
  await typeAtEnd(b, " Б-ГИЙН");
  await settle(b);
  await a.bringToFront();
  await typeAtEnd(a, " нэмэлт");
  await a.waitForTimeout(1500);
  const drafts = await a.evaluate(() => [
    localStorage.getItem("mdDraft:letter:application") ?? "",
    localStorage.getItem("mdDraft:letter:minutes") ?? "",
  ]);
  assert.ok(drafts[0]!.includes("А-ГИЙН нэмэлт"));
  assert.ok(drafts[1]!.includes("Б-ГИЙН"));
  assert.ok(!drafts[1]!.includes("А-ГИЙН"));
});

test("ижил цонх эсвэл өөр төсөл нээлттэй бол анхааруулна", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  const b = await openPage(app, context);
  const warned = (text: string) => /өөр табад/.test(text);
  assert.ok(warned(await until(() => status(a), warned)));
  await chooseSlot(b, "Бичвэр 2");
  await a.waitForTimeout(9000);
  assert.ok(!warned(await status(a)));

  await openFile(a, app.files.project);
  await openFile(b, app.files.other);
  const other = (text: string) => /өөр LaTeX төсөл/.test(text);
  assert.ok(other(await until(() => status(a), other)));
  assert.ok(other(await until(() => status(b), other)));
});

test("хоёр табад нэг төслийн өөр файлын засвар хоёулаа хадгалагдана", async () => {
  const context = await app.context();
  const a = await openPage(app, context);
  await openFile(a, app.files.project);
  await a.waitForTimeout(3000);
  const b = await openPage(app, context);
  await a.bringToFront();
  await projectFile(a, "main.tex");
  await typeAtEnd(a, "\n% А-гийн засвар");
  await a.waitForTimeout(2000);
  await b.bringToFront();
  await projectFile(b, "mystyle.sty");
  await typeAtEnd(b, "\n% Б-гийн засвар");
  await b.waitForTimeout(2000);
  await reload(a);
  await projectFile(a, "main.tex");
  const main = await editor(a);
  await projectFile(a, "mystyle.sty");
  const sty = await editor(a);
  assert.ok(main.endsWith("% А-гийн засвар"), main);
  assert.ok(main.includes("\\documentclass"));
  assert.ok(sty.endsWith("% Б-гийн засвар"), sty);
  assert.ok(sty.includes("\\ProvidesPackage"));
});
