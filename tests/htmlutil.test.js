import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/htmlutil.js";

test("escapeHtml тусгай тэмдэгтүүдийг хувиргана", () => {
  assert.equal(
    escapeHtml("<b>үг & дүн</b>"),
    "&lt;b&gt;үг &amp; дүн&lt;/b&gt;",
  );
});

test("escapeHtml энгийн текстийг өөрчлөхгүй", () => {
  assert.equal(escapeHtml("Баффеттын 50%"), "Баффеттын 50%");
});

test("escapeHtml: хоосон мөр", () => {
  assert.equal(escapeHtml(""), "");
});

test("escapeHtml: давтагдсан тэмдэгтүүд", () => {
  assert.equal(escapeHtml("<<&&>>"), "&lt;&lt;&amp;&amp;&gt;&gt;");
});
