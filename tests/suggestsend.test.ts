import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_WORDS,
  postSuggestion,
  sendBlock,
  sendFailure,
} from "../src/feedback/suggestsend.ts";

test("sendBlock илгээх боломжгүй шалтгааныг дарааллаар нь буцаана", () => {
  assert.match(sendBlock(0, false, "")!, /нэг үг/);
  assert.match(sendBlock(MAX_WORDS + 1, true, "t")!, /хамгийн ихдээ 50/);
  assert.match(sendBlock(1, false, "")!, /Сүлжээгүй/);
  assert.match(sendBlock(1, true, "")!, /Баталгаажуулалт/);
  assert.equal(sendBlock(MAX_WORDS, true, "t"), null);
});

test("sendFailure хариуны төлвөөр мессеж сонгоно", () => {
  assert.match(sendFailure(null), /Сүлжээний алдаа/);
  assert.match(sendFailure(429), /Цагийн хязгаар/);
  assert.match(sendFailure(500), /Илгээхэд алдаа/);
});

test("postSuggestion JSON илгээж төлвийг буцаана, сүлжээний алдаанд null", async () => {
  const seen: RequestInit[] = [];
  const ok = (async (_url: unknown, init?: RequestInit) => {
    seen.push(init!);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const payload = { words: ["үг"], note: "", turnstileToken: "t" };
  assert.equal(await postSuggestion(payload, ok), 201);
  assert.equal(seen[0]!.method, "POST");
  assert.deepEqual(JSON.parse(String(seen[0]!.body)), payload);
  const down = (async () => {
    throw new TypeError("offline");
  }) as typeof fetch;
  assert.equal(await postSuggestion(payload, down), null);
});
