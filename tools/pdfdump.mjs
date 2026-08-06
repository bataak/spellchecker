import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
const wantPage = Number(process.argv[3] || 1);
if (!file) {
  console.error("хэрэглээ: node tools/pdfdump.mjs <файл.pdf> [хуудас]");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data }).promise;
const page = await doc.getPage(wantPage);
const content = await page.getTextContent();

const show = (s) =>
  [...s]
    .map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && !(cp >= 0x7f && cp <= 0xa0) && cp !== 0xad && cp !== 0xfffd) return ch;
      return "<" + cp.toString(16).toUpperCase().padStart(4, "0") + ">";
    })
    .join("");

let index = 0;
for (const item of content.items) {
  if (!("str" in item)) continue;
  const y = item.transform ? item.transform[5].toFixed(1) : "-";
  const x = item.transform ? item.transform[4].toFixed(1) : "-";
  console.log(
    String(index++).padStart(4),
    "x=" + String(x).padStart(7),
    "y=" + String(y).padStart(7),
    "eol=" + (item.hasEOL ? "1" : "0"),
    "w=" + String(item.width ?? "-").padStart(6),
    "font=" + (item.fontName ?? "-"),
    "|",
    show(item.str),
  );
}
// await doc.destroy();
