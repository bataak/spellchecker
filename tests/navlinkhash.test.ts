import { test } from "node:test";
import assert from "node:assert/strict";
import { navLinkHash } from "../src/app/linkpaste.ts";
import { linkHash, newLink, newToken } from "../src/collab/collabkey.ts";

const hosts = ["aldaa.bichig.dev"];

test("navLinkHash: апп-ын хост дээрх талбарын холбоосыг танина", () => {
  assert.equal(
    navLinkHash("https://aldaa.bichig.dev/#letter/application", hosts),
    "#letter/application",
  );
  assert.equal(
    navLinkHash(" https://aldaa.bichig.dev/#letter\n", hosts),
    "#letter",
  );
  assert.equal(
    navLinkHash("https://aldaa.bichig.dev/#file/%D0%B0.md", hosts),
    "#file/%D0%B0.md",
  );
  assert.equal(
    navLinkHash("https://aldaa.bichig.dev/#project/a/b.tex", hosts),
    "#project/a/b.tex",
  );
  assert.equal(
    navLinkHash("https://aldaa.bichig.dev/#url=https%3A%2F%2Fx.org", hosts),
    "#url=https%3A%2F%2Fx.org",
  );
});

test("navLinkHash: бусад холбоос, бичвэрийг танихгүй", () => {
  const invite = linkHash({ ...newLink(), invite: newToken() });
  assert.equal(navLinkHash("https://aldaa.bichig.dev/" + invite, hosts), null);
  assert.equal(navLinkHash("https://evil.example/#letter", hosts), null);
  assert.equal(navLinkHash("https://aldaa.bichig.dev/#letter/x", hosts), null);
  assert.equal(navLinkHash("https://aldaa.bichig.dev/#other", hosts), null);
  assert.equal(navLinkHash("https://aldaa.bichig.dev/", hosts), null);
  assert.equal(
    navLinkHash("Энд https://aldaa.bichig.dev/#letter", hosts),
    null,
  );
  assert.equal(navLinkHash("#letter", hosts), null);
});
