import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildOdt, verbatimText } from "../src/office/odt/create.ts";
import { openOdf } from "../src/office/odf/index.ts";

test("verbatimText: эхний ба олон зай, табыг ODF-д хадгална", () => {
  assert.equal(verbatimText("a"), "a");
  assert.equal(verbatimText(" a"), "<text:s/>a");
  assert.equal(verbatimText("    a"), '<text:s text:c="4"/>a');
  assert.equal(verbatimText("a  b"), "a <text:s/>b");
  assert.equal(verbatimText("a\tb<"), "a<text:tab/>b&lt;");
});

test("ODT: кодын блокийн мөр, догол, хоосон мөрийг хадгална", () => {
  const code = "def f():\n    return 1\n\n  x  =  2";
  const md = "# Г\n\n```\n" + code + "\n```\n";
  const odt = buildOdt(applyTemplate(parse(md), findTemplate("report")!), {
    toc: false,
  });
  const text = openOdf(odt).text;
  assert.ok(text.includes(code), JSON.stringify(text));
});
