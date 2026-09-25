import test from "node:test";
import assert from "node:assert/strict";

import { rawGet, rawSet, resetStorage } from "./helpers/mock-storage.ts";
import { migrateLegacyDrafts } from "../src/mdtoolbar.ts";
import {
  LEGACY_TEMPLATES,
  TEMPLATE_GROUPS,
  TEMPLATES,
  findTemplate,
  isPlain,
} from "../src/templates.ts";

test("таван талбар, хоёр бүлэг", () => {
  assert.deepEqual(
    TEMPLATES.map((t) => t.name),
    ["Бичвэр 1", "Бичвэр 2", "Албан бичиг", "Тайлан", "Илтгэл"],
  );
  assert.deepEqual(
    TEMPLATE_GROUPS.map((g) => g.name),
    ["Алдаа шалгах", "Баримт бичиг бэлтгэх"],
  );
  const grouped = TEMPLATE_GROUPS.flatMap((g) => g.ids);
  assert.deepEqual([...grouped].sort(), TEMPLATES.map((t) => t.id).sort());
});

test("isPlain: бичвэрийн талбар .txt, бусад нь markdown", () => {
  assert.equal(isPlain("plain"), true);
  assert.equal(isPlain("plain2"), true);
  assert.equal(isPlain("letter"), false);
  assert.equal(isPlain("report"), false);
  assert.equal(isPlain("slides"), false);
});

test("хасагдсан загвар бүр одоо байгаа талбар руу заана", () => {
  for (const target of Object.values(LEGACY_TEMPLATES))
    assert.ok(findTemplate(target), target);
});

test("хуучин ноорог шинэ талбартаа нийлнэ", () => {
  resetStorage();
  rawSet("mdDraft:report", "тайлан");
  rawSet("mdDraft:essay", "эссе");
  rawSet("mdDraft:application", "өргөдөл");

  const pending = migrateLegacyDrafts("plain");

  assert.deepEqual(pending, []);
  assert.equal(rawGet("mdDraft:report"), "тайлан\n\nэссе");
  assert.equal(rawGet("mdDraft:letter"), "өргөдөл");
  assert.equal(rawGet("mdDraft:essay"), null);
  assert.equal(rawGet("mdDraft:application"), null);
});

test("идэвхтэй талбарын хуучин ноорог хадгалагдсаар үлдэнэ", () => {
  resetStorage();
  rawSet("mdDraft:coursework", "бие даалт");

  assert.deepEqual(migrateLegacyDrafts("report"), ["coursework"]);
  assert.equal(rawGet("mdDraft:coursework"), "бие даалт");
});
