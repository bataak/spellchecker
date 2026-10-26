import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEX_TOOLS } from "../src/tex/texmenudata.ts";
import { menuEdit } from "../src/tex/texmenuedit.ts";
import { glyphId, symbolTex } from "../src/tex/texglyphs.ts";

test("цэсний товч бүр өвөрмөц нэртэй, тайлбартай", () => {
  const ids = TEX_TOOLS.map((tool) => tool.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(TEX_TOOLS.every((tool) => tool.glyph && tool.title));
});

test("цэсний сонголт бүр хоосон бичвэрт засвар үүсгэнэ", () => {
  for (const tool of TEX_TOOLS) {
    if (tool.kind !== "list") continue;
    for (const section of tool.sections)
      for (const item of section.items) {
        if (item.insert.kind === "close") continue;
        assert.ok(menuEdit("", 0, 0, item.insert), item.label);
      }
  }
});

test("тэмдгийн палитрт давхардсан тэмдэг, команд байхгүй", () => {
  const palette = TEX_TOOLS.find((tool) => tool.kind === "palette");
  assert.ok(palette?.kind === "palette");
  const symbols = palette.tabs.flatMap((tab) => tab.symbols);
  assert.equal(new Set(symbols.map((s) => s.command)).size, symbols.length);
  assert.equal(new Set(symbols.map((s) => s.glyph)).size, symbols.length);
  assert.ok(symbols.every((s) => /^[A-Za-z]/.test(s.command)));
});

test("LaTeX-ээр зурсан тэмдэг бүр sprite-д байна", () => {
  const sprite = readFileSync(
    new URL("../src/tex/texglyphs.svg", import.meta.url),
    "utf8",
  );
  const sources = TEX_TOOLS.flatMap((tool) => [
    ...(tool.tex ? [tool.tex] : []),
    ...(tool.kind === "palette"
      ? tool.tabs.flatMap((tab) =>
          tab.symbols.map((symbol) => symbolTex(symbol.command)),
        )
      : []),
  ]);
  for (const tex of sources)
    assert.ok(sprite.includes(`id="${glyphId(tex)}"`), tex);
});

test("glyphId нь LaTeX эхийг давхцалгүй id болгоно", () => {
  assert.equal(glyphId("\\alpha"), "g-5calpha");
  assert.notEqual(glyphId("\\{"), glyphId("\\}"));
  assert.equal(symbolTex("sqrt{#}"), "\\sqrt{\\phantom{x}}");
});
