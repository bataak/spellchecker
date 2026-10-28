import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse, toHtml } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { printHtml } from "../src/office/print.ts";
import { tableLook, tableRow } from "../src/office/table.ts";
import { toLatexBody } from "../src/tex/latex.ts";

const sheet = (attrs: string): string =>
  [
    "::: {" + attrs + "}",
    "| №   | Нэр |",
    "| --- | --- |",
    "| 1   |     |",
    "| 2   |     |",
    ":::",
  ].join("\n");

const doc = (md: string) => applyTemplate(parse(md), findTemplate("report")!);

const zipped = (bytes: Uint8Array, part: string): string =>
  strFromU8(unzipSync(bytes)[part]!);

test("tableLook ба tableRow: .lines, .grid ба row-ийг уншина", () => {
  assert.deepEqual(tableLook(["lines"], { width: "100%", row: "1cm" }), {
    share: 1,
    rules: "lines",
    rowCm: 1,
  });
  assert.equal(tableLook(["lines", "grid"], {}).rules, "grid");
  assert.deepEqual(tableLook([], {}), {
    share: null,
    rules: null,
    rowCm: null,
  });
  assert.equal(tableRow("8mm"), 0.8);
  assert.equal(tableRow("1.5cm"), 1.5);
  for (const bad of [undefined, "", "1", "2pt", "0cm"])
    assert.equal(tableRow(bad), null, String(bad));
});

test("урьдчилан харах: .lines/.grid класс ба мөрийн өндрийг дамжуулна", () => {
  const html = toHtml(parse(sheet('width="100%" .lines row="1cm"')));
  assert.match(html, /class="md-div md-lines"/);
  assert.match(html, /--table-row:1cm/);
  assert.match(toHtml(parse(sheet(".grid"))), /class="md-div md-grid"/);
});

test("хэвлэх: шугамын класс ба мөрийн өндөр", () => {
  const html = printHtml(doc(sheet('.lines row="1cm"')));
  assert.match(html, /<table class="lines"/);
  assert.match(html, /table\.lines td\{border-bottom:0\.5pt solid #000\}/);
  assert.equal(html.match(/<tr data-style="height:1(\.0+)?cm">/g)?.length, 2);
  assert.match(printHtml(doc(sheet(".grid"))), /<table class="grid"/);
  assert.doesNotMatch(
    printHtml(doc(sheet('width="100%"'))),
    /<table class="(lines|grid)"/,
  );
});

test("DOCX: мөр хоорондын шугам, тор, мөрийн өндөр", () => {
  const lines = zipped(
    buildDocx(doc(sheet('.lines row="1cm"'))),
    "word/document.xml",
  );
  assert.match(lines, /<w:insideH w:val="single" w:sz="4"/);
  assert.equal(
    lines.match(/<w:trHeight w:val="567" w:hRule="atLeast"\/>/g)?.length,
    2,
  );
  const grid = zipped(buildDocx(doc(sheet(".grid"))), "word/document.xml");
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"])
    assert.match(grid, new RegExp("<w:" + side + ' w:val="single" w:sz="4"'));
  const plain = zipped(
    buildDocx(doc(sheet('width="100%"'))),
    "word/document.xml",
  );
  assert.doesNotMatch(plain, /insideH|trHeight/);
});

test("ODT: мөр хоорондын шугам, тор, мөрийн өндөр", () => {
  const lines = zipped(buildOdt(doc(sheet('.lines row="1cm"'))), "content.xml");
  assert.match(lines, /table:style-name="C_lines"/);
  assert.match(lines, /style:min-row-height="1(\.0+)?cm"/);
  assert.equal(
    lines.match(/<table:table-row table:style-name="Table1\.R">/g)?.length,
    2,
  );
  const grid = zipped(buildOdt(doc(sheet(".grid"))), "content.xml");
  assert.match(grid, /table:style-name="C_grid"/);
  assert.match(
    grid,
    /style:name="C_grid"[^>]*><style:table-cell-properties fo:border="0\.5pt solid #000000"/,
  );
});

test("LaTeX: .lines мөр хооронд \\midrule, .grid тор, row strut", () => {
  const lines = toLatexBody(parse(sheet('.lines row="1cm"')));
  assert.match(
    lines,
    /\\rule\{0pt\}\{1cm\}1 & {2}\\\\\n\\midrule\n\\rule\{0pt\}\{1cm\}2/,
  );
  const grid = toLatexBody(parse(sheet(".grid")));
  assert.match(grid, /\\begin\{tabular\}\{\|l\|l\|\}/);
  assert.equal(grid.match(/\\hline/g)?.length, 4);
  assert.doesNotMatch(
    toLatexBody(parse(sheet('width="100%"'))),
    /\\hline|\\rule\{0pt\}/,
  );
});
