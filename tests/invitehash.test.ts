import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inviteHash,
  linkHash,
  newLink,
  newToken,
  shortHash,
} from "../src/collab/collabkey.ts";

test("inviteHash: зөвхөн апп-ын хост дээрх урилгын холбоосыг танина", () => {
  const link = { ...newLink(), invite: newToken() };
  const hosts = ["aldaa.bichig.dev", "localhost:5173"];
  const full = "https://aldaa.bichig.dev/" + linkHash(link);
  assert.equal(inviteHash(full, hosts), linkHash(link));
  assert.equal(inviteHash("  " + full + "\n", hosts), linkHash(link));
  const short =
    "http://localhost:5173/" + shortHash("abcdEFGH", "k".repeat(43));
  assert.equal(inviteHash(short, hosts), "#j=abcdEFGH." + "k".repeat(43));
  assert.equal(
    inviteHash("https://evil.example/" + linkHash(link), hosts),
    null,
  );
  assert.equal(inviteHash("https://aldaa.bichig.dev/#other", hosts), null);
  assert.equal(inviteHash("Сайн уу " + full, hosts), null);
  assert.equal(inviteHash("энгийн бичвэр", hosts), null);
  assert.equal(inviteHash("", hosts), null);
});
