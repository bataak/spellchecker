import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrapLog, wantedFiles } from "../src/tex/texmissing.ts";

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

test("babel-ийн танигдаагүй хэлний .ldf файлыг хайна", () => {
  const log =
    "! Package babel Error: Unknown option 'english'.\n(babel)                Suggested actions:";
  const files = wantedFiles(log, ["english.ldf"]);
  assert.ok(files.includes("english.ldf"));
  assert.ok(files.includes("babel-english.tex"));
});

test("79 тэмдэгтээр тасарсан фонтын алдааг таньж файлын нэрийг гаргана", () => {
  const log =
    "! Font OT1/PTSans-TLF/m/it/9=PTSans-Italic-tlf-ot1 at 9.0pt not loadable: Metri\n" +
    "c (TFM) file not found.\n<to be read again>";
  assert.equal(
    "! Font OT1/PTSans-TLF/m/it/9=PTSans-Italic-tlf-ot1 at 9.0pt not loadable: Metri"
      .length,
    79,
  );
  assert.equal(
    unwrapLog(log),
    "! Font OT1/PTSans-TLF/m/it/9=PTSans-Italic-tlf-ot1 at 9.0pt not loadable: Metric (TFM) file not found.\n<to be read again>",
  );
  assert.ok(wantedFiles(log, []).includes("PTSans-Italic-tlf-ot1.tfm"));
});
