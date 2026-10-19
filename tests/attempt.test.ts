import { test } from "node:test";
import assert from "node:assert/strict";
import { attempt, attemptAsync } from "../src/core/attempt.ts";

test("attempt: амжилттай бол үр дүнг буцаана", () => {
  assert.equal(
    attempt(() => 2, 0),
    2,
  );
});

test("attempt: алдаа гарвал fallback буцаана", () => {
  assert.equal(
    attempt(() => decodeURIComponent("%"), "fallback"),
    "fallback",
  );
});

test("attemptAsync: reject болбол fallback буцаана", async () => {
  assert.equal(
    await attemptAsync(() => Promise.reject(new Error("x")), null),
    null,
  );
  assert.equal(await attemptAsync(async () => "ok", null), "ok");
});
