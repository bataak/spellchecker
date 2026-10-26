import test from "node:test";
import assert from "node:assert/strict";

import { createLate } from "../src/core/late.ts";

interface Parts {
  count: number;
  read: () => number;
}

test("late: өгсөн хэсгийг буцааж, өгөөгүйг нэрээр нь мэдэгдэнэ", () => {
  const late = createLate<Parts>();
  const read = (): number => late.count;
  late.provide({ read });
  assert.equal(late.read, read);
  assert.throws(() => read(), /count is used before it is wired/);
  late.provide({ count: 2 });
  assert.equal(read(), 2);
});

test("late: нэг хэсгийг хоёр дахь удаа өгөхийг хориглоно", () => {
  const late = createLate<Parts>();
  late.provide({ count: 1 });
  assert.throws(() => late.provide({ count: 2 }), /count is already wired/);
  assert.equal(late.count, 1);
  assert.equal(
    (late as unknown as Record<symbol, unknown>)[Symbol.iterator],
    undefined,
  );
});

test("late: Promise-оор буцаахад then-ийг хайхад алдаа өгөхгүй", async () => {
  const late = createLate<Parts>();
  late.provide({ count: 3 });
  const resolved = await Promise.resolve(late);
  assert.equal(resolved.count, 3);
});
