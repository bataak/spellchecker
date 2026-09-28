import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { FORMATS } from "../src/export.ts";
import { TEX_BUNDLE, TEX_ENGINE } from "../src/texbundle.ts";

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
  const { PdfError } = await import("../src/texpdf.ts");
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
});
