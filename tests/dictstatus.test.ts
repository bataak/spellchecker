import { resetStorage } from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createDictStatus, createRefreshGate } from "../src/dict/dictstatus.ts";
import { dictStatusMessage } from "../src/offline.ts";

beforeEach(resetStorage);

test("dictstatus идэвхгүй англи толийг мэдэгдэлд харуулахгүй", () => {
  const status = createDictStatus();
  assert.deepEqual(status.active(), ["mn_MN", "en_GB", "en_US"]);
  status.loaded(["mn_MN", "en_US"], null, null);
  assert.equal(
    status.base(),
    dictStatusMessage(["mn_MN", "en_US"], null, null),
  );
  status.setEnglish(new Set(), ["mn_MN", "en_US"]);
  assert.deepEqual(status.active(), ["mn_MN"]);
  assert.equal(status.base(), dictStatusMessage(["mn_MN"], null, null));
});

test("dictstatus англи толь солиход анх ачаалсан шалтгааныг хадгална", () => {
  const status = createDictStatus();
  const failed = [{ id: "en_GB", error: "x" }];
  status.loaded(["mn_MN"], failed, "reason");
  status.setEnglish(new Set(), ["mn_MN"]);
  assert.equal(status.base(), dictStatusMessage(["mn_MN"], failed, "reason"));
});

test("dictstatus офлайн индикаторын төлөвийг хадгална", () => {
  const status = createDictStatus();
  assert.equal(status.indicating(), false);
  status.setIndicating(true);
  assert.equal(status.indicating(), true);
});

test("createRefreshGate эхний удаа зөвшөөрч, завсрын дотор хориглоно", () => {
  const due = createRefreshGate(100);
  assert.equal(due(1000), true);
  assert.equal(due(1050), false);
  assert.equal(due(1100), true);
  assert.equal(due(1150), false);
});
