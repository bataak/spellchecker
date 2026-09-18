import { test } from "node:test";
import assert from "node:assert/strict";
import { sameRoot } from "../src/morphology.ts";
import {
  clipText,
  displayHeadword,
  pickDefinitionMarks,
  placeTip,
} from "../src/defmarks.ts";

const prefixRoot = (left: string, right: string): boolean =>
  left.slice(0, 3) === right.slice(0, 3);

test("толь идэвхгүй үед дугуй гаргахгүй", () => {
  assert.equal(pickDefinitionMarks(["ном"], null, prefixRoot).size, 0);
});

test("ижил язгууртай үгсээс зөвхөн эхнийхийг тэмдэглэнэ", () => {
  const marks = pickDefinitionMarks(
    ["номч", "ном", "луу", "номын"],
    { номч: "НОМЧ", ном: "НОМ", луу: "ЛУУ" },
    prefixRoot,
  );
  assert.deepEqual([...marks], ["номч", "луу"]);
});

test("толинд олдоогүй үг язгуурын байрыг эзлэхгүй", () => {
  const marks = pickDefinitionMarks(
    ["номын", "ном"],
    { ном: "НОМ" },
    prefixRoot,
  );
  assert.deepEqual([...marks], ["ном"]);
});

test("том жижиг үсгийн ялгаатай хувилбарыг нэг гэж үзнэ", () => {
  const never = (): boolean => false;
  const marks = pickDefinitionMarks(
    ["Ном", "ном"],
    { Ном: "НОМ", ном: "НОМ" },
    never,
  );
  assert.deepEqual([...marks], ["Ном"]);
});

test("ижил толгой үгт хүрсэн хэлбэрүүдээс нэгийг л тэмдэглэнэ", () => {
  const never = (): boolean => false;
  const marks = pickDefinitionMarks(
    ["номын", "номоор", "ус"],
    { номын: "НОМ", номоор: "НОМ", ус: "УС" },
    never,
  );
  assert.deepEqual([...marks], ["номын", "ус"]);
});

test("өөр толгой үгтэй хэлбэрүүд тус бүр тэмдэглэгдэнэ", () => {
  const marks = pickDefinitionMarks(
    ["номинд", "номд", "номойд"],
    { номинд: "НОМИН", номд: "НОМ", номойд: "НОМОЙ" },
    sameRoot,
  );
  assert.deepEqual([...marks], ["номинд", "номд", "номойд"]);
});

test("ижил толгой үгтэй хэлбэрүүд бодит sameRoot дээр ч нэгдэнэ", () => {
  const marks = pickDefinitionMarks(
    ["номд", "номонд", "номын"],
    { номд: "НОМ", номонд: "НОМ", номын: "НОМ" },
    sameRoot,
  );
  assert.deepEqual([...marks], ["номд"]);
});

test("толгой үггүй хэлбэрүүдэд л язгуурын бүлэглэлт ажиллана", () => {
  const marks = pickDefinitionMarks(
    ["номинд", "номд"],
    { номинд: "номинд", номд: "НОМ" },
    sameRoot,
  );
  assert.deepEqual([...marks], ["номинд", "номд"]);
});

test("displayHeadword нь ТОМ үсэгтэй толгой үгийг жижиг болгоно", () => {
  assert.equal(displayHeadword("НОМ", "ном"), "ном");
  assert.equal(displayHeadword("НОМ", "Ном"), "Ном");
  assert.equal(displayHeadword("НОМ", "номын"), "ном");
  assert.equal(displayHeadword("Монгол улс", "монголын"), "Монгол улс");
});

const view = { left: 0, top: 0, width: 1000, height: 800 };
const tip = { width: 200, height: 100 };

test("зай байвал popover-ийн баруун талд байрлана", () => {
  const place = placeTip(
    { left: 280, top: 100, right: 300, bottom: 120 },
    { left: 100, top: 90, right: 300, bottom: 400 },
    tip,
    view,
  );
  assert.deepEqual(place, { left: 308, top: 100 });
});

test("баруун талд зайгүй бол зүүн талд байрлана", () => {
  const place = placeTip(
    { left: 880, top: 100, right: 900, bottom: 120 },
    { left: 700, top: 90, right: 900, bottom: 400 },
    tip,
    view,
  );
  assert.deepEqual(place, { left: 492, top: 100 });
});

test("нарийн дэлгэцэнд дугуйн доор байрлаж, дэлгэцээс гарахгүй", () => {
  const narrow = { left: 0, top: 0, width: 360, height: 640 };
  const place = placeTip(
    { left: 300, top: 600, right: 320, bottom: 620 },
    { left: 10, top: 400, right: 350, bottom: 630 },
    tip,
    narrow,
  );
  assert.deepEqual(place, { left: 120, top: 492 });
});

test("clipText нь урт текстийг үгийн хил дээр тасална", () => {
  assert.equal(clipText("богино", 20), "богино");
  assert.equal(clipText("нэг хоёр гурав дөрөв", 12), "нэг хоёр\u2026");
});
