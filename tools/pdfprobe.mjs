import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
if (!file) {
  console.error("хэрэглээ: node tools/pdfprobe.mjs <файл.pdf>");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(file));
console.log("файлын хэмжээ:", (data.length / 1024 / 1024).toFixed(1), "МБ");

const loadingTask = getDocument({ data, verbosity: 1 });

try {
  const doc = await loadingTask.promise;
  console.log("хуудасны тоо:", doc.numPages);
  const meta = await doc.getMetadata().catch(() => null);
  if (meta) {
    console.log("producer:", meta.info?.Producer ?? "-");
    console.log("creator :", meta.info?.Creator ?? "-");
  }
  const limit = Math.min(doc.numPages, 8);
  for (let index = 1; index <= limit; index++) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    const ops = await page.getOperatorList().catch(() => null);
    const annotations = await page.getAnnotations().catch(() => []);
    const chars = content.items.reduce(
      (sum, item) => sum + ("str" in item ? item.str.length : 0),
      0,
    );
    console.log(
      "хуудас " + String(index).padStart(3),
      "| items=" + String(content.items.length).padStart(5),
      "| тэмдэгт=" + String(chars).padStart(6),
      "| ops=" + String(ops ? ops.fnArray.length : "-").padStart(6),
      "| annot=" + annotations.length,
    );
    if (chars > 0) {
      const first = content.items.find(
        (item) => "str" in item && item.str.trim(),
      );
      console.log("        эхний текст:", JSON.stringify(first?.str ?? ""));
    }
    page.cleanup();
  }
} catch (error) {
  console.error("алдаа:", error instanceof Error ? error.message : error);
} finally {
  await loadingTask.destroy();
}
