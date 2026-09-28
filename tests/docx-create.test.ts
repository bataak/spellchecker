import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildDocx } from "../src/office/docx/create.ts";

const build = (md: string, id: string, toc = false): Record<string, string> =>
  Object.fromEntries(
    Object.entries(
      unzipSync(
        buildDocx(applyTemplate(parse(md), findTemplate(id)!), {
          toc,
        }),
      ),
    ).map(([k, v]) => [k, strFromU8(v)]),
  );

const REPORT =
  "# Тайлан\n\n## Оршил\n\nДогол [холбоос](https://a.mn).\n\n" +
  "3. в\n4. г\n\n| A | B |\n| - | -: |\n| 1 | 2 |\n\n## Дүгнэлт\n\nТөгсгөл.\n";

test("buildDocx: үндсэн хэсгүүд", () => {
  const out = build(REPORT, "report");
  for (const part of [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "word/numbering.xml",
    "word/settings.xml",
    "word/footer1.xml",
  ])
    assert.ok(out[part], part);
  assert.equal(out["word/header1.xml"], undefined);
  assert.ok(out["word/footer1.xml"]!.includes(" PAGE "));
  assert.ok(
    out["word/document.xml"]!.includes(
      '<w:footerReference w:type="default" r:id="rId4"/>',
    ),
  );
  assert.ok(out["word/styles.xml"]!.includes('<w:name w:val="heading 2"/>'));
  assert.ok(out["word/styles.xml"]!.includes('<w:sz w:val="24"/>'));
});

test("buildDocx: гарчгийн жагсаалт сонголтоор", () => {
  const without = build(REPORT, "report");
  assert.ok(!without["word/document.xml"]!.includes("TOC \\o"));
  assert.ok(!without["word/settings.xml"]!.includes("updateFields"));

  const doc = build(REPORT, "report", true);
  const body = doc["word/document.xml"]!;
  assert.ok(body.includes('TOC \\o "1-3" \\h \\z \\u'));
  assert.ok(body.includes('w:anchor="_Toc100001"'));
  assert.ok(body.includes('w:name="_Toc100001"'));
  assert.ok(body.indexOf("Гарчиг") > body.indexOf(">Тайлан<"));
  assert.ok(
    doc["word/settings.xml"]!.includes('<w:updateFields w:val="true"/>'),
  );
});

test("buildDocx: жагсаалтын эхлэл, холбоос", () => {
  const out = build(REPORT, "report");
  assert.ok(
    out["word/numbering.xml"]!.includes('<w:startOverride w:val="3"/>'),
  );
  const rels = out["word/_rels/document.xml.rels"]!;
  assert.ok(rels.includes('Target="https://a.mn" TargetMode="External"'));
  assert.ok(out["word/document.xml"]!.includes('<w:hyperlink r:id="rId10"'));
});

test("buildDocx: албан бичигт баруун блок мөр шилжилттэй", () => {
  const md =
    "# Нэр\n\nДогол.\n\n::: {.signature}\nӨргөдөл гаргасан: Б. Боролдой\\\nУтас: 9911\n:::\n";
  const out = build(md, "letter");
  assert.ok(
    out["word/document.xml"]!.includes('<w:pStyle w:val="SignatureTop"/>'),
  );
  assert.ok(out["word/document.xml"]!.includes("<w:br/>"));
  assert.ok(out["word/styles.xml"]!.includes('w:styleId="SignatureTop"'));
});
