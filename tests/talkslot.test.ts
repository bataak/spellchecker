import test from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
test.after(() => dom.close());

const slot = await import("../src/ui/talkslot.ts");

const shown = (): string | undefined =>
  document.documentElement.dataset.talkSlot;

const tick = (): Promise<void> =>
  new Promise((resolve) => queueMicrotask(resolve));

test("talkslot: төлөвөөс data-talk-slot-ыг зурж, өөрчлөлтийг нэг удаа мэдэгдэнэ", async () => {
  let calls = 0;
  const off = slot.onSlotChange(() => calls++);
  slot.setTalkOpen(true);
  slot.placeTalkSlot("swap");
  assert.equal(shown(), "swap");
  assert.equal(slot.talkCovers(), true);
  await tick();
  assert.equal(calls, 1);
  slot.placeTalkSlot("swap");
  await tick();
  assert.equal(calls, 1);
  slot.yieldTalk(true);
  assert.equal(slot.talkYielded(), true);
  assert.equal(slot.talkCovers(), false);
  assert.equal(shown(), "yield");
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
  assert.equal(shown(), "float");
  slot.placeTalkSlot("swap");
  slot.yieldTalk(true);
  slot.setTalkOpen(false);
  assert.equal(slot.talkOpen(), false);
  assert.equal(slot.talkFloats(), false);
  assert.equal(shown(), undefined);
  slot.setTalkOpen(true);
  assert.equal(slot.talkYielded(), false);
  slot.setTalkOpen(false);
});

test("talkslot: swap биш үед байраа өгөх хүсэлтийг үл тоомсорлоно", () => {
  slot.setTalkOpen(true);
  slot.placeTalkSlot("column");
  slot.yieldTalk(true);
  assert.equal(slot.talkYielded(), false);
  assert.equal(shown(), "column");
  slot.setTalkOpen(false);
});
