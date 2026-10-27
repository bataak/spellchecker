import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  databaseOpener,
  requestResult,
  transactionDone,
} from "../src/core/idb.ts";

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

test("databaseOpener: нэг холболтыг дахин ашиглаж, versionchange-д хаагаад дахин нээнэ", async () => {
  const name = "opener-" + Math.random();
  const open = databaseOpener(name, (db) => db.createObjectStore("kv"));
  const first = await open();
  assert.equal(await open(), first);
  const removed = indexedDB.deleteDatabase(name);
  await requestResult(removed);
  const again = await open();
  assert.notEqual(again, first);
  assert.ok(again.objectStoreNames.contains("kv"));
  again.close();
});

test("databaseOpener: нээж чадаагүй бол дараагийн удаа дахин оролдоно", async () => {
  const name = "opener-fail-" + Math.random();
  let calls = 0;
  const open = databaseOpener(name, (db) => {
    calls++;
    if (calls === 1) throw new Error("upgrade");
    db.createObjectStore("kv");
  });
  await assert.rejects(open());
  const db = await open();
  assert.ok(db.objectStoreNames.contains("kv"));
  db.close();
});
