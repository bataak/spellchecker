import test from "node:test";
import assert from "node:assert/strict";

import {
  FILE_LIMIT,
  isFileSlot,
  nextFileId,
  bytesSum,
  fileSum,
  parseSlots,
  sameFile,
  textSum,
} from "../src/fileslots.ts";

test("nextFileId: хаагдсан файлын дугаарыг дахин өгөхгүй", () => {
  const slots = [{ id: "file-1", name: "a.txt", sum: null }];
  const ids = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const id = nextFileId(slots);
    assert.ok(isFileSlot(id), id);
    assert.notEqual(id, "file-1");
    ids.add(id);
  }
  assert.equal(ids.size, 50);
  assert.ok(isFileSlot(nextFileId([])));
});

test("isFileSlot: зөвхөн file- угтвартай slot", () => {
  assert.equal(isFileSlot("file-3"), true);
  assert.equal(isFileSlot("letter:application"), false);
  assert.equal(isFileSlot("plain"), false);
});

test("parseSlots: эвдэрсэн, давхардсан, хэтэрсэн бичлэгийг шүүнэ", () => {
  assert.deepEqual(parseSlots(null), []);
  assert.deepEqual(parseSlots("{"), []);
  const raw = JSON.stringify([
    { id: "file-1", name: "a.txt", sum: "x" },
    { id: "file-1", name: "dup.txt" },
    { id: "plain", name: "bad" },
    { id: "file-2", name: "" },
    { id: "file-3", name: "c.md" },
  ]);
  assert.deepEqual(parseSlots(raw), [
    { id: "file-1", name: "a.txt", sum: "x" },
    { id: "file-3", name: "c.md", sum: null },
  ]);
  const many = JSON.stringify(
    Array.from({ length: 15 }, (_, i) => ({
      id: "file-" + i,
      name: i + ".txt",
    })),
  );
  assert.equal(parseSlots(many).length, FILE_LIMIT);
});

test("textSum: ижил бичвэрт ижил, өөрт өөр утга", () => {
  assert.equal(textSum("Сайн уу"), textSum("Сайн уу"));
  assert.notEqual(textSum("Сайн уу"), textSum("Сайн уу!"));
});

test("sameFile: нэр ба байтын hash, эсвэл хадгалсан бичвэрээр танина", () => {
  const bytes = new TextEncoder().encode("сайн\r\nбайна");
  const hash = bytesSum(bytes);
  const slot = {
    id: "file-1",
    name: "a.txt",
    sum: textSum("сайн\nбайна"),
    hash,
  };
  assert.equal(sameFile(slot, "a.txt", hash, null), true);
  assert.equal(sameFile(slot, "b.txt", hash, null), false);
  assert.equal(sameFile(slot, "a.txt", "x", "сайн\r\nбайна"), true);
  assert.equal(sameFile(slot, "a.txt", "x", "өөр"), false);
  assert.notEqual(
    bytesSum(new Uint8Array([1, 2])),
    bytesSum(new Uint8Array([2, 1])),
  );
});

test("parseSlots: hash-ийг хадгална", () => {
  assert.deepEqual(
    parseSlots(
      JSON.stringify([{ id: "file-1", name: "a.odt", sum: null, hash: "h" }]),
    ),
    [{ id: "file-1", name: "a.odt", sum: null, hash: "h" }],
  );
});

test("fileSum: том файлын дунд хэсгийн өөрчлөлтийг ялгана", async () => {
  const size = 600 * 1024;
  const first = new Uint8Array(size);
  const second = new Uint8Array(size);
  second[size / 2] = 1;
  assert.notEqual(
    await fileSum(new Blob([first])),
    await fileSum(new Blob([second])),
  );
  assert.equal(await fileSum(new Blob([first])), bytesSum(first));
});
