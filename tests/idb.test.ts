import test from "node:test";
import assert from "node:assert/strict";

import { requestResult, transactionDone } from "../src/core/idb.ts";

type Handlers = Record<string, (() => void) | null>;

test("transactionDone: дуусахад resolve, abort-д жинхэнэ алдааг дамжуулна", async () => {
  const ok: Handlers = {};
  const done = transactionDone(ok as never);
  ok.oncomplete!();
  await done;

  const quota = new Error("quota");
  quota.name = "QuotaExceededError";
  const tx: Handlers & { error: Error | null } = { error: null };
  const failed = transactionDone(tx as never);
  assert.equal(tx.onerror, undefined);
  tx.error = quota;
  tx.onabort!();
  await assert.rejects(failed, (error) => error === quota);
});

test("requestResult: үр дүн эсвэл алдааг буцаана", async () => {
  const request: Handlers & { result?: number; error?: Error | null } = {};
  const value = requestResult(request as never);
  request.result = 7;
  request.onsuccess!();
  assert.equal(await value, 7);
  const bad: Handlers & { error: null } = { error: null };
  const failed = requestResult(bad as never);
  bad.onerror!();
  await assert.rejects(failed, /IndexedDB request failed/);
});
