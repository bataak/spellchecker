import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse, toHtml } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { printHtml } from "../src/office/print.ts";
import {
  cellStrokes,
  tableLook,
  tableRow,
  tableStrokes,
} from "../src/markdown/tablelook.ts";
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

test("tableStrokes: шугам бүрийг нэг л нүд эзэмшинэ", () => {
  const grid = tableStrokes("grid", true);
  const at = (row: number, column: number) =>
    cellStrokes(grid, { row, rows: 3, column, columns: 2 });
  assert.deepEqual(at(0, 0), { top: 1, bottom: 1, left: 1, right: 1 });
  assert.deepEqual(at(1, 1), { top: 0, bottom: 1, left: 0, right: 1 });
  const plain = tableStrokes(null, true);
  const only = cellStrokes(plain, { row: 0, rows: 1, column: 0, columns: 1 });
  assert.deepEqual(only, { top: 2, bottom: 2, left: 0, right: 0 });
  const bare = tableStrokes("lines", false);
  assert.deepEqual(
    [0, 1].map(
      (row) =>
        cellStrokes(bare, { row, rows: 2, column: 0, columns: 1 }).bottom,
    ),
    [1, 1],
  );
  assert.equal(tableStrokes(null, false).top, 0);
});

test("урьдчилан харах: .lines/.grid шугам ба мөрийн өндрийг нүдэнд өгнө", () => {
  const html = toHtml(parse(sheet('width="100%" .lines row="1cm"')));
  assert.match(html, /<td class="e-b1">1<\/td>/);
  assert.equal(html.match(/<tr data-style="height:1cm">/g)?.length, 2);
  assert.match(
    toHtml(parse(sheet(".grid"))),
    /<th class="e-t1 e-b1 e-l1 e-r1">№<\/th><th class="e-t1 e-b1 e-r1">/,
  );
});

test("хэвлэх: шугамын класс ба мөрийн өндөр", () => {
  const html = printHtml(doc(sheet('.lines row="1cm"')));
  assert.match(html, /<td class="e-b1"><p/);
  assert.match(html, /td\.e-b1\{border-bottom:0\.5pt solid #000\}/);
  assert.equal(html.match(/<tr data-style="height:1(\.0+)?cm">/g)?.length, 2);
  assert.match(printHtml(doc(sheet(".grid"))), /<td class="e-b1 e-r1"><p/);
  assert.doesNotMatch(
    printHtml(doc(sheet('width="100%"'))),
    /class="[^"]*e-[lr]1/,
  );
});

test("DOCX: мөр хоорондын шугам, тор, мөрийн өндөр", () => {
  const lines = zipped(
    buildDocx(doc(sheet('.lines row="1cm"'))),
    "word/document.xml",
  );
  assert.match(lines, /<w:insideH w:val="single" w:sz="4"/);
  assert.match(lines, /<w:top w:val="single" w:sz="8"/);
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
  assert.match(lines, /table:style-name="C_0100"/);
  assert.match(lines, /table:style-name="C_2100h"/);
  assert.match(lines, /style:min-row-height="1(\.0+)?cm"/);
  assert.equal(
    lines.match(/<table:table-row table:style-name="Table1\.R">/g)?.length,
    2,
  );
  const grid = zipped(buildOdt(doc(sheet(".grid"))), "content.xml");
  assert.match(grid, /table:style-name="C_0101"/);
  assert.match(
    grid,
    /style:name="C_1111h"[^>]*><style:table-cell-properties fo:border-top="0\.5pt solid #000000" fo:border-bottom="0\.5pt solid #000000" fo:border-left="0\.5pt solid #000000" fo:border-right="0\.5pt solid #000000"/,
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

test("хэвлэх: гарчгийн мөр thead-д орж хуудас бүрт давтагдана, .grid хүрээ нэгтгэхгүй", () => {
  const html = printHtml(doc(sheet(".grid")));
  assert.match(html, /<thead><tr><td class="c-head e-t1 e-b1 e-l1 e-r1">/);
  assert.match(html, /<\/thead><tbody><tr/);
  assert.match(html, /table\{border-collapse:separate;border-spacing:0;/);
  const bare = printHtml(
    doc(
      [
        "::: {.grid}",
        "|   |   |",
        "| - | - |",
        "| 1 | 2 |",
        "| 3 | 4 |",
        ":::",
      ].join("\n"),
    ),
  );
  assert.doesNotMatch(bare, /<thead><tr><td class=/);
  assert.equal(bare.match(/class="e-t1 /g)?.length, 2);
});

test("гадна хашилтын харагдах байдал дотор хашилтын хүснэгтэд хүрэхгүй", () => {
  const md = [
    '::: {width="100%" .grid}',
    "| А | Б |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "::: {.left}",
    "| В | Г |",
    "| - | - |",
    "| 3 | 4 |",
    ":::",
    ":::",
  ].join("\n");
  const tables = doc(md).blocks.filter((b) => b.kind === "table");
  assert.equal(tables.length, 2);
  assert.equal(tables[0]!.kind === "table" && tables[0]!.rules, "grid");
  assert.equal(tables[1]!.kind === "table" && tables[1]!.rules, undefined);
});

test(".lines: гарчигтай бол хэвлэлтэд 1pt хаалт, гарчиггүй бол DOCX ба LaTeX-д сүүлийн мөрийн доор шугам", () => {
  assert.match(printHtml(doc(sheet(".lines"))), /<td class="e-b2"><p/);
  const bare = [
    "::: {.lines}",
    "|   |   |",
    "| - | - |",
    "| 1 | 2 |",
    "| 3 | 4 |",
    ":::",
  ].join("\n");
  const docx = zipped(buildDocx(doc(bare)), "word/document.xml");
  assert.match(
    docx,
    /<w:tblBorders><w:bottom w:val="single" w:sz="4"[^>]*\/><w:insideH/,
  );
  const latex = toLatexBody(parse(bare));
  assert.match(latex, /3 & 4 \\\\\n\\midrule\n\\end\{tabular\}/);
});
