import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoster } from "../src/collab/admin.ts";
import {
  importKey,
  newLink,
  seal,
  toBase64Url,
} from "../src/collab/collabkey.ts";

test("хамтрагчийн нэрээс далд, чиглэл солих тэмдэгтийг хасна", async () => {
  const key = await importKey(newLink().key);
  const raw = "\u202eСар\u200bаа" + "я".repeat(80);
  const label = toBase64Url(await seal(key, new TextEncoder().encode(raw)));
  const [member] = await decodeRoster(key, [
    { dev: "a", label, online: true, owner: false },
  ]);
  assert.equal(member!.name, "Сараа" + "я".repeat(35));
});
