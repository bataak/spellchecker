import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("LaTeX редактор уруу чирсэн HEIC зургийг JPEG болгож оруулна", async () => {
  const dir = mkdtempSync(join(tmpdir(), "heic-tex-"));
  const tex = join(dir, "doc.tex");
  writeFileSync(
    tex,
    "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n",
  );
  const page = await openPage(app, await app.context());
  await openFile(page, tex);
  const bytes = [...readFileSync(resolve("tests/fixtures/sample.heic"))];
  await page.evaluate((data) => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.focus();
    area.setSelectionRange(
      area.value.indexOf("А") + 1,
      area.value.indexOf("А") + 1,
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(data)], "photo.heic", { type: "" }),
    );
    area.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, bytes);
  assert.match(
    await until(
      () => editor(page),
      (text) => text.includes("photo.jpg"),
      30000,
    ),
    /\\includegraphics\[width=\\linewidth\]\{photo\.jpg\}/,
  );
  assert.deepEqual(errors(page), []);
});
