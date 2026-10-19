import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUTTONS,
  buildButtons,
  formatEdit,
} from "../src/mdbar/mdbuttons.ts";
import { escapeAttr } from "../src/htmlutil.ts";
import { pickerOptions } from "../src/slots/slotmenu.ts";

const NOW = new Date(2026, 9, 18);

test("formatEdit: тод, налуу, код тэмдэглэгээг ороож авна", () => {
  assert.equal(formatEdit("bold", "сайн үг", 5, 7, NOW).text, "сайн **үг**");
  assert.equal(formatEdit("italic", "сайн үг", 5, 7, NOW).text, "сайн *үг*");
  assert.equal(formatEdit("code", "x y", 2, 3, NOW).text, "x `y`");
});

test("formatEdit: гарчиг, жагсаалт, ишлэл", () => {
  assert.equal(formatEdit("h2", "Гарчиг", 0, 0, NOW).text, "## Гарчиг");
  assert.equal(formatEdit("bullet", "нэг", 0, 0, NOW).text, "- нэг");
  assert.equal(formatEdit("ordered", "нэг", 0, 0, NOW).text, "1. нэг");
  assert.equal(formatEdit("quote", "үг", 0, 0, NOW).text, "> үг");
});

test("buildButtons: товч бүрийг role, title-тэй гаргана", () => {
  const html = buildButtons();
  for (const spec of BUTTONS)
    assert.ok(html.includes('data-role="' + spec.role + '"'), spec.role);
  assert.equal(
    escapeAttr('<a href="x">&'),
    "&lt;a href=&quot;x&quot;&gt;&amp;",
  );
});

test("pickerOptions: нээлттэй файл, төсөл, загваруудыг жагсаана", () => {
  const files = [{ id: "file-1", name: "<тайлан>.md", sum: null }];
  const html = pickerOptions(files, () => true, {
    name: "Тезис",
    dirty: false,
  });
  assert.ok(
    html.startsWith(
      '<div class="md-menu-group" role="presentation">Нээлттэй файлууд</div>',
    ),
  );
  assert.ok(html.includes("&lt;тайлан&gt;.md"));
  assert.ok(html.includes('data-close="file-1"'));
  assert.ok(html.includes('data-value="project"'));
  assert.equal(html.split("md-menu-dot").length - 1, 1);
  assert.ok(!pickerOptions([], () => false, null).includes("Нээлттэй файлууд"));
});
