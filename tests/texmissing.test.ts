import { test } from "node:test";
import assert from "node:assert/strict";
import { wantedFiles } from "../src/texmissing.ts";

test("дутуу .sty файлыг LaTeX-ийн алдаанаас олно", () => {
  const log =
    "! LaTeX Error: File `pgfplots.sty' not found.\n\nType X to quit or <RETURN> to proceed,";
  assert.deepEqual(
    wantedFiles(log, ["pgfplots.sty", "pgfplots.cfg", "main.aux"]),
    ["pgfplots.sty"],
  );
});

test("\\input-ийн дутуу файлыг олно", () => {
  const log = "! I can't find file `tikzlibrarycd.code.tex'.";
  assert.deepEqual(wantedFiles(log, []), ["tikzlibrarycd.code.tex"]);
});

test("дутуу TFM фонтыг олдоогүй файлын жагсаалтаас өргөтгөлтэй нь авна", () => {
  const log =
    "! Font T1/lmr/m/n/10=ec-lmr10 at 10.0pt not loadable: Metric (TFM) file not found.";
  const files = wantedFiles(log, ["ec-lmr10.tfm", "t1lmr.fd"]);
  assert.ok(files.includes("ec-lmr10.tfm"));
  assert.ok(!files.includes("t1lmr.fd"));
});

test("pdfTeX-ийн Type 1 фонтын алдааг олно", () => {
  const log =
    "!pdfTeX error: pdflatex (file lmr10.pfb): cannot open Type 1 font file for reading";
  assert.ok(wantedFiles(log, ["lmr10.pfb"]).includes("lmr10.pfb"));
});

test("алдаагүй лог дээр юу ч татахгүй", () => {
  assert.deepEqual(
    wantedFiles("! Undefined control sequence.\nl.5 \\foo", [
      "hyperref.cfg",
      "main.toc",
    ]),
    [],
  );
});
