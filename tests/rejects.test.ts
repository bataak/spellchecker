import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeRejected,
  encodeRejected,
  type RejectedChange,
} from "../src/collab/rejects.ts";

const record = (inserted: string): RejectedChange => ({
  id: "a",
  at: 1,
  path: null,
  inserted,
  removed: "",
  author: null,
  before: "",
  after: "",
  start: "s",
  end: "e",
});

test("татгалзсан том өөрчлөлт дахин ачаалахад хадгалагдсан хэвээр байна", () => {
  const big = record("ү".repeat(30_000));
  assert.deepEqual(decodeRejected(encodeRejected([big])), [big]);
});

test("эвдэрсэн бичлэгийг хасна", () => {
  const broken = { ...record("x"), inserted: 5 } as unknown as RejectedChange;
  assert.deepEqual(decodeRejected(encodeRejected([broken])), []);
});
