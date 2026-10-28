import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  editor,
  errors,
  openFile,
  openPage,
  startApp,
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

test("HEIC зургийг JPEG болгож хөрвүүлээд md-д оруулна", async () => {
  const doc = join(mkdtempSync(join(tmpdir(), "heic-")), "тайлан.md");
  writeFileSync(doc, "# Тайлан\n\n");
  const page = await openPage(app, await app.context());
  await page.setViewportSize({ width: 1700, height: 900 });
  await openFile(page, doc);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click('button[title="Зураг"]'),
  ]);
  await chooser.setFiles(resolve("tests/fixtures/sample.heic"));
  assert.match(
    await until(
      () => editor(page),
      (text) => text.includes("sample.jpg"),
      30000,
    ),
    /!\[[^\]]*\]\(sample\.jpg\)/,
  );
  const size = await until(
    () =>
      page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(
          '.preview-body img[src^="blob:"]',
        );
        return img?.complete ? [img.naturalWidth, img.naturalHeight] : null;
      }),
    (dims) => dims !== null,
    30000,
  );
  assert.deepEqual(size, [64, 48]);
  assert.deepEqual(errors(page), []);
});
