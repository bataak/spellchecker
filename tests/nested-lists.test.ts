import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { printHtml } from "../src/office/print.ts";

const MD = "# Т\n\n- Хоол\n  1. Цуйван\n  2. Бууз\n- Ундаа\n  - Цай\n";
const doc = () => applyTemplate(parse(MD), findTemplate("report")!);
const unzip = (bytes: Uint8Array): Record<string, string> =>
  Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]),
  );

test("buildDocx: дэд жагсаалт дээд түвшинтэйгээ гарна", () => {
  const out = unzip(buildDocx(doc(), { toc: false }));
  const levels = [
    ...out["word/document.xml"]!.matchAll(
      /<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>(?:(?!<\/w:p>).)*?<w:t[^>]*>([^<]+)</gs,
    ),
  ].map(([, level, num, text]) => text + ":" + level + "/" + num);
  assert.deepEqual(levels, [
    "Хоол:0/1",
    "Цуйван:1/2",
    "Бууз:1/2",
    "Ундаа:0/1",
    "Цай:1/3",
  ]);
  const numbering = out["word/numbering.xml"]!;
  assert.match(numbering, /<w:lvl w:ilvl="1">.*?<w:lvlText w:val="%2\."\/>/s);
  assert.match(
    numbering,
    /<w:num w:numId="2"><w:abstractNumId w:val="2"\/><w:lvlOverride w:ilvl="1">/,
  );
});

test("buildOdt: дэд жагсаалт эх мөр дотроо орно", () => {
  const content = unzip(buildOdt(doc(), { toc: false }))["content.xml"]!;
  const list = /<text:list text:style-name="L_bullet">.*<\/text:list>/s.exec(
    content,
  )![0];
  const shape = list
    .replace(
      /<text:p[^>]*>(?:(?!<\/text:p>).)*?([А-Яа-яӨөҮүЁё]+)(?:(?!<\/text:p>).)*<\/text:p>/gs,
      "$1",
    )
    .replace(/<text:list text:style-name="L_(\w+)">/g, "[$1 ")
    .replace(/<\/text:list>/g, "]")
    .replace(/<\/?text:list-item>/g, " ")
    .replace(/\s+/g, " ");
  assert.equal(
    shape.trim(),
    "[bullet Хоол[num Цуйван Бууз ] Ундаа[bullet Цай ] ]",
  );
});

test("printHtml: дэд жагсаалт <li> дотор орно", () => {
  const html = printHtml(doc());
  const shape = /<ul>.*<\/ul>/s
    .exec(html)![0]
    .replace(/<p[^>]*>([^<]*)<\/p>/g, "$1")
    .replace(/<\/?li>/g, " ")
    .replace(/\s+/g, " ");
  assert.equal(
    shape,
    "<ul> Хоол<ol> Цуйван Бууз </ol> Ундаа<ul> Цай </ul> </ul>",
  );
});

test("buildOdt: дугаарласан жагсаалтын эхлэх дугаар хадгалагдана", () => {
  const content = unzip(
    buildOdt(
      applyTemplate(parse("3. Гурав\n4. Дөрөв\n"), findTemplate("report")!),
      {
        toc: false,
      },
    ),
  )["content.xml"]!;
  assert.match(content, /<text:list-item text:start-value="3">/);
  assert.equal(content.match(/text:start-value/g)?.length, 1);
});
