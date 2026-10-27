import test from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
test.after(() => dom.close());

const slot = await import("../src/ui/talkslot.ts");

const flags = (): string[] =>
  ["data-talk", "data-talk-float", "data-talk-swap", "data-talk-yield"].filter(
    (name) => document.documentElement.hasAttribute(name),
  );

const tick = (): Promise<void> =>
  new Promise((resolve) => queueMicrotask(resolve));

test("talkslot: төлөвөөс attribute-ыг зурж, өөрчлөлтийг нэг удаа мэдэгдэнэ", async () => {
  let calls = 0;
  const off = slot.onSlotChange(() => calls++);
  slot.setTalkOpen(true);
  slot.placeTalkSlot("swap");
  assert.deepEqual(flags(), ["data-talk", "data-talk-swap"]);
  assert.equal(slot.talkCovers(), true);
  await tick();
  assert.equal(calls, 1);
  slot.placeTalkSlot("swap");
  await tick();
  assert.equal(calls, 1);
  slot.yieldTalk(true);
  assert.equal(slot.talkYielded(), true);
  assert.equal(slot.talkCovers(), false);
  assert.deepEqual(flags(), ["data-talk", "data-talk-swap", "data-talk-yield"]);
  await tick();
  assert.equal(calls, 2);
  off();
});

test("talkslot: байрлал солигдох эсвэл цонх хаагдахад байраа өгсөн төлөв арилна", () => {
  slot.setTalkOpen(true);
  slot.placeTalkSlot("swap");
  slot.yieldTalk(true);
  slot.placeTalkSlot("float");
  assert.equal(slot.talkYielded(), false);
  assert.equal(slot.talkFloats(), true);
  assert.deepEqual(flags(), ["data-talk", "data-talk-float"]);
  slot.placeTalkSlot("swap");
  slot.yieldTalk(true);
  slot.setTalkOpen(false);
  assert.equal(slot.talkOpen(), false);
  assert.equal(slot.talkFloats(), false);
  assert.deepEqual(flags(), []);
  slot.setTalkOpen(true);
  assert.equal(slot.talkYielded(), false);
  slot.setTalkOpen(false);
});

test("talkslot: swap биш үед байраа өгөх хүсэлтийг үл тоомсорлоно", () => {
  slot.setTalkOpen(true);
  slot.placeTalkSlot("column");
  slot.yieldTalk(true);
  assert.equal(slot.talkYielded(), false);
  assert.deepEqual(flags(), ["data-talk"]);
  slot.setTalkOpen(false);
});
