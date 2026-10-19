import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { FORMATS } from "../src/export/exportformats.ts";
import { TEX_BUNDLE, TEX_ENGINE } from "../src/tex/texbundle.ts";

test("PDF экспортын хөдөлгүүр ба TeX багц public/-д байна", () => {
  assert.ok(existsSync("public/" + TEX_ENGINE));
  assert.ok(existsSync("public/" + TEX_ENGINE.replace(/\.js$/, ".wasm")));
  assert.ok(existsSync("public/" + TEX_BUNDLE));
});

test("PDF формат баримт, слайдад санал болгогдоно", () => {
  const pdf = FORMATS.find((format) => format.id === "pdf");
  assert.ok(pdf);
  assert.deepEqual([...pdf.frames], ["letter", "structured", "slides"]);
  assert.equal(pdf.mime, "application/pdf");
});

test("PDF алдааны мессеж шалтгаан ба байршлыг Монгол үсгээр харуулна", async () => {
  const { PdfError } = await import("../src/tex/texpdf.ts");
  const log = [
    "! LaTeX Error: Bad math environment delimiter.",
    "",
    "l.22 ...^b4^^d0^^b0^^d0^^bd^^d0^^b0. $\\displaymath",
    "                                                   c+1$",
  ].join("\n");
  const error = new PdfError(log);
  assert.equal(error.name, "PdfError");
  assert.equal(
    error.message,
    "PDF үүсгэж чадсангүй: Bad math environment delimiter. — «ана. $\\displaymath c+1$»",
  );
  assert.equal(new PdfError("").message, "PDF үүсгэж чадсангүй.");
  const fatal = [
    "pdfTeX warning (ext4): destination with the same identifier (name{page.3}) has been already used, duplicate ignored",
    "",
    "\\pgfpages@shipoutshipoutbox ...physicalpagesizes }",
    "                                                  \\endgroup ",
    "l.36 \\end{frame}",
    "                   ]",
    "!pdfTeX error:  (file tcss0800): Font tcss0800 at 600 not found",
    " ==> Fatal error occurred, no output PDF file produced!",
  ].join("\n");
  assert.equal(
    new PdfError(fatal).message,
    "PDF үүсгэж чадсангүй: Font tcss0800 at 600 not found",
  );
});

test("гарчгийн жагсаалт зөвхөн бүлэгтэй баримтад", async () => {
  const { hasSections } = await import("../src/export/exportformats.ts");
  const { readFileSync } = await import("node:fs");
  const ex = (name: string): string =>
    readFileSync("src/examples/" + name + ".md", "utf8");
  assert.equal(hasSections(ex("application"), "letter"), false);
  assert.equal(hasSections(ex("minutes"), "letter"), true);
  assert.equal(hasSections(ex("research"), "report"), true);
  assert.equal(hasSections("# Ганц гарчиг\n\nДогол.\n", "report"), false);
  assert.equal(hasSections(ex("presentation"), "slides"), false);
});

test("ODT гарчгийн жагсаалт сонголтоор", async () => {
  const { FORMATS } = await import("../src/export/exportformats.ts");
  const { unzipSync, strFromU8 } = await import("fflate");
  const odt = FORMATS.find((format) => format.id === "odt")!;
  const md = "# Нэр\n\n## Нэг\n\nДогол.\n\n### Хоёр\n\nДогол.\n";
  const content = async (toc: boolean): Promise<string> =>
    strFromU8(
      unzipSync((await odt.build(md, "report", { toc })) as Uint8Array)[
        "content.xml"
      ]!,
    );
  assert.ok(!(await content(false)).includes("text:table-of-content"));
  const withToc = await content(true);
  assert.ok(
    withToc.includes('<text:table-of-content-source text:outline-level="3">'),
  );
  assert.ok(
    withToc.includes('<text:p text:style-name="TOC_2">Нэг<text:tab/></text:p>'),
  );
  assert.ok(withToc.indexOf("table-of-content") > withToc.indexOf(">Нэр<"));
});

test("алдааг алгассан engine-ийн PDF-ийг зөвхөн терминалд алдаа гараагүй үед авна", async () => {
  const { replyPdf } = await import("../src/tex/texpdf.ts");
  const pdf = new ArrayBuffer(4);
  assert.equal(replyPdf({ result: "ok", status: 0, log: "", pdf }), pdf);
  assert.equal(
    replyPdf({ result: "failed", status: 1, log: "Output written", pdf }),
    pdf,
  );
  assert.equal(
    replyPdf({
      result: "failed",
      status: 1,
      log: "! Undefined control sequence.",
      pdf,
    }),
    null,
  );
  assert.equal(replyPdf({ result: "failed", status: 3, log: "", pdf }), null);
  assert.equal(replyPdf({ result: "failed", status: 1, log: "" }), null);
});
