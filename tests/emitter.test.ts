import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmitter } from "../src/core/emitter.ts";

test("emitter сонсогчдод дамжуулж, цуцлах болон цэвэрлэхийг дэмжинэ", () => {
  const emitter = createEmitter<number>();
  const heard: number[] = [];
  const off = emitter.on((value) => heard.push(value));
  emitter.on((value) => heard.push(value * 10));
  emitter.emit(1);
  off();
  emitter.emit(2);
  emitter.clear();
  emitter.emit(3);
  assert.deepEqual(heard, [1, 10, 20]);
});
