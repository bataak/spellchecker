import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEnabled,
  serializeEnabled,
  activeIds,
  visibleIds,
} from "../src/dictmenu.ts";

const sorted = (set: Set<string>): string[] => [...set].sort();

test("parseEnabled: null өгвөл хоёул идэвхтэй", () => {
  assert.deepEqual(sorted(parseEnabled(null)), ["en_GB", "en_US"]);
});

test("parseEnabled: хоосон жагсаалт = хоёул унтарсан", () => {
  assert.deepEqual([...parseEnabled("[]")], []);
});

test("parseEnabled: дан сонголтыг хадгална", () => {
  assert.deepEqual([...parseEnabled('["en_GB"]')], ["en_GB"]);
});

test("parseEnabled: танихгүй id-г хаяна", () => {
  assert.deepEqual([...parseEnabled('["en_US","xx_YY","mn_MN"]')], ["en_US"]);
});

test("parseEnabled: гэмтсэн JSON = үндсэн (хоёул)", () => {
  assert.deepEqual(sorted(parseEnabled("not json")), ["en_GB", "en_US"]);
});

test("parseEnabled: жагсаалт биш утга = үндсэн (хоёул)", () => {
  assert.deepEqual(sorted(parseEnabled('"en_GB"')), ["en_GB", "en_US"]);
});

test("serializeEnabled: EN_IDS дарааллаар гаргана", () => {
  assert.equal(
    serializeEnabled(new Set(["en_US", "en_GB"])),
    '["en_GB","en_US"]',
  );
});

test("serialize→parse round-trip", () => {
  for (const raw of ["[]", '["en_GB"]', '["en_US"]', '["en_GB","en_US"]']) {
    const set = parseEnabled(raw);
    assert.equal(serializeEnabled(set), serializeEnabled(parseEnabled(raw)));
    assert.deepEqual([...parseEnabled(serializeEnabled(set))], [...set]);
  }
});

test("activeIds: монгол толь үргэлж эхэнд орно", () => {
  assert.deepEqual(activeIds(new Set()), ["mn_MN"]);
  assert.deepEqual(activeIds(new Set(["en_GB"])), ["mn_MN", "en_GB"]);
  assert.deepEqual(activeIds(new Set(["en_GB", "en_US"])), [
    "mn_MN",
    "en_GB",
    "en_US",
  ]);
});

test("visibleIds: хоёул унтарвал зөвхөн монгол толь үлдэнэ", () => {
  const loaded = ["mn_MN", "en_GB", "en_US"];
  assert.deepEqual(visibleIds(loaded, new Set()), ["mn_MN"]);
});

test("visibleIds: дан англи толь идэвхтэй бол түүнийг үлдээнэ", () => {
  const loaded = ["mn_MN", "en_GB", "en_US"];
  assert.deepEqual(visibleIds(loaded, new Set(["en_GB"])), ["mn_MN", "en_GB"]);
});

test("visibleIds: хоёул идэвхтэй бол бүгд харагдана", () => {
  const loaded = ["mn_MN", "en_GB", "en_US"];
  assert.deepEqual(visibleIds(loaded, new Set(["en_GB", "en_US"])), loaded);
});

test("visibleIds: монгол толийг хэзээ ч үл хасна", () => {
  assert.deepEqual(visibleIds(["mn_MN"], new Set()), ["mn_MN"]);
});
