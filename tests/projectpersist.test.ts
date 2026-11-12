import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import { createPersist, storedEdits } from "../src/project/projectpersist.ts";
import { markDirty, newState } from "../src/project/projectstate.ts";

test("бичилт бүтэлгүйтсэн засварыг дараагийн хадгалалтаар дахин бичнэ", async () => {
  const bytes = new TextEncoder().encode("zero");
  const state = newState(1, "memory", "p", null, [["a.tex", bytes]], []);
  const persist = createPersist(() => state);
  const edit = (text: string): void => {
    state.texts.set("a.tex", text);
    markDirty(state, "a.tex");
  };

  edit("one");
  await persist.save();
  assert.deepEqual({ ...(await storedEdits()) }, { "a.tex": "one" });

  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = () => {
    throw new Error("quota");
  };
  edit("two");
  try {
    await persist.save();
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.deepEqual({ ...(await storedEdits()) }, { "a.tex": "one" });
  assert.deepEqual({ ...state.persisted }, { "a.tex": "one" });

  await persist.save();
  assert.deepEqual({ ...(await storedEdits()) }, { "a.tex": "two" });
  assert.deepEqual({ ...state.persisted }, { "a.tex": "two" });
});
