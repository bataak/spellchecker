import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefinitionCache } from "../src/define/definitions.ts";

const entry = { headword: "үг", text: "тайлбар", source: "толь" };

test("createDefinitionCache: олдсон тайлбарыг дахин асуухгүй", async () => {
  let calls = 0;
  const cache = createDefinitionCache(async () => {
    calls++;
    return { dicts: 1, source: "", entries: [entry] as never[] };
  });
  await cache.get("үг");
  await cache.get("үг");
  assert.equal(calls, 1);
  cache.reset();
  await cache.get("үг");
  assert.equal(calls, 2);
});

test("createDefinitionCache: хоосон хариуг хадгалахгүй", async () => {
  let calls = 0;
  const cache = createDefinitionCache(async () => {
    calls++;
    return { dicts: 1, source: "", entries: [] };
  });
  await cache.get("алга");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await cache.get("алга");
  assert.equal(calls, 2);
});
