import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  html,
  joinHtml,
  trustedHtml,
} from "../src/core/htmlutil.ts";

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

test("html: зөвхөн Html болон тоог холбож, бусад бичвэрийг escape-ээр дамжуулна", () => {
  assert.equal(html`<b>${escapeHtml("<x>")}</b> ${3}`, "<b>&lt;x&gt;</b> 3");
});

test("joinHtml: Html хэсгүүдийг заасан тусгаарлагчаар нийлүүлнэ", () => {
  assert.equal(
    joinHtml([html`a`, trustedHtml("<i>b</i>")], html` · `),
    "a · <i>b</i>",
  );
  assert.equal(joinHtml([html`a`, html`b`]), "ab");
});
