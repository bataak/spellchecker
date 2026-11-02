import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom();
const { flattenForeignObjects, svgText } = await import("../src/tex/texsvg.ts");

test.after(() => dom.close());

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const HTML = 'xmlns="http://www.w3.org/1999/xhtml"';

const ascii = (text: string): number[] =>
  [...text].map((char) => char.charCodeAt(0));

function flat(inner: string): string {
  const doc = new DOMParser().parseFromString(
    "<svg " + NS + ">" + inner + "</svg>",
    "image/svg+xml",
  );
  flattenForeignObjects(doc.documentElement);
  return doc.documentElement.innerHTML;
}

test("svgText: файлын кодчилолыг таньж уншина", () => {
  assert.equal(
    svgText(
      new Uint8Array([
        ...ascii('<?xml version="1.0" encoding="windows-1251"?><a>'),
        0xcc,
        0xed,
        ...ascii("</a>"),
      ]),
    ),
    '<?xml version="1.0" encoding="windows-1251"?><a>Мн</a>',
  );
  assert.equal(svgText(new Uint8Array([0xff, 0xfe, 0x31, 0x04])), "б");
  assert.equal(svgText(new Uint8Array([0xfe, 0xff, 0x04, 0x31])), "б");
  assert.equal(svgText(new TextEncoder().encode("үг")), "үг");
  assert.equal(
    svgText(new TextEncoder().encode('<?xml encoding="bad-label"?>ү')),
    '<?xml encoding="bad-label"?>ү',
  );
});

test("flattenForeignObjects: switch-ийн нөөц бичвэрийг хэрэглэнэ", () => {
  const out = flat(
    "<switch><foreignObject><div " +
      HTML +
      ">Дотор</div></foreignObject><text>Нөөц</text></switch>",
  );
  assert.ok(out.includes("Нөөц"));
  assert.ok(!out.includes("Дотор"));
  assert.ok(!out.includes("switch"));
});

test("flattenForeignObjects: нөөцгүй HTML-ийг SVG бичвэр болгож мөр таслана", () => {
  const out = flat(
    '<foreignObject x="10" y="20" width="60"><div ' +
      HTML +
      ' style="font-size: 10px">Нэг хоёр гурав дөрөв</div></foreignObject>',
  );
  assert.ok(!out.includes("foreignObject"));
  assert.match(out, /font-size="10"/);
  assert.match(out, /<tspan[^>]*x="10"[^>]*y="30"[^>]*>Нэг хоёр</);
  assert.match(out, /y="42"[^>]*>гурав</);
  assert.match(out, /y="54"[^>]*>дөрөв</);
});

test("flattenForeignObjects: хоосон HTML-ийг устгана", () => {
  assert.equal(
    flat("<foreignObject><div " + HTML + "> </div></foreignObject>"),
    "",
  );
});

test("flattenForeignObjects: байрлалын transform-ыг хадгална", () => {
  const out = flat(
    '<foreignObject transform="translate(5 6)"><div ' +
      HTML +
      ">Үг</div></foreignObject>",
  );
  assert.match(out, /<text[^>]*transform="translate\(5 6\)"/);
});
