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

test("attempt: барьсан алдааг onError уруу дамжуулна", async () => {
  const seen: unknown[] = [];
  const failure = new Error("sync");
  attempt(
    () => {
      throw failure;
    },
    0,
    (error) => seen.push(error),
  );
  const rejection = new Error("async");
  await attemptAsync(
    () => Promise.reject(rejection),
    0,
    (error) => seen.push(error),
  );
  attempt(
    () => 1,
    0,
    (error) => seen.push(error),
  );
  assert.deepEqual(seen, [failure, rejection]);
});
