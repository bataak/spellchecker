import { test } from "node:test";
import assert from "node:assert/strict";
import { clearTitle, saveTitle } from "../src/export/savehints.ts";

test("saveTitle нээлттэй файлын нэрийг товчлолтой нь харуулна", () => {
  const base = "Бичвэрийг файл болгож хадгалах · Ctrl+S";
  assert.equal(saveTitle(base, null), base);
  assert.equal(
    saveTitle(base, "тайлан.md"),
    "тайлан.md болгож хадгална · Ctrl+S",
  );
  assert.equal(
    saveTitle("Бичвэрийг файл болгож хадгалах", "a.docx"),
    "a.docx болгож хадгална",
  );
});

test("clearTitle файл нээлттэй үед хаахыг дурдана", () => {
  const base = "Талбарыг цэвэрлэх · Ctrl+Shift+Delete";
  assert.equal(clearTitle(base, false), base);
  assert.equal(
    clearTitle(base, true),
    "Файлыг хааж, талбарыг цэвэрлэх · Ctrl+Shift+Delete",
  );
  assert.equal(clearTitle("Өөр", true), "Өөр");
});
