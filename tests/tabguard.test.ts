import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OTHER_PROJECT,
  SAME_SLOT,
  conflictOf,
  initTabGuard,
} from "../src/core/tabguard.ts";

test("ижил цонх өөр табад нээлттэй бол анхааруулна", () => {
  const others = [{ id: "b", slot: "plain", project: null }];
  assert.equal(conflictOf({ slot: "plain", project: null }, others), SAME_SLOT);
  assert.equal(conflictOf({ slot: "plain2", project: null }, others), null);
});

test("өөр табад өөр төсөл нээлттэй бол анхааруулна", () => {
  const others = [{ id: "b", slot: "plain", project: "uid-2" }];
  assert.equal(
    conflictOf({ slot: "project", project: "uid-1" }, others),
    OTHER_PROJECT,
  );
  assert.equal(conflictOf({ slot: "project", project: "uid-2" }, others), null);
  assert.equal(conflictOf({ slot: "project", project: null }, others), null);
  assert.equal(
    conflictOf({ slot: "project", project: "uid-1" }, [
      { id: "b", slot: "project", project: "uid-2" },
    ]),
    OTHER_PROJECT,
  );
  assert.equal(
    conflictOf({ slot: "project", project: "uid-1" }, [
      { id: "b", slot: "project", project: "uid-1" },
    ]),
    SAME_SLOT,
  );
});

test("хоёр таб нэг цонхонд орвол хоёулаа анхааруулга авна", async () => {
  const channel = "test-tabs-" + String(Date.now());
  const warned: string[] = [];
  let slotB = "plain2";
  const a = initTabGuard({
    channel,
    delay: 0,
    slot: () => "plain",
    project: () => null,
    warn: (message) => warned.push("a:" + message),
  });
  const b = initTabGuard({
    channel,
    delay: 0,
    slot: () => slotB,
    project: () => null,
    warn: (message) => warned.push("b:" + message),
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(warned, []);
  slotB = "plain";
  b.sync();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(warned.sort(), ["a:" + SAME_SLOT, "b:" + SAME_SLOT]);
  a.close();
  b.close();
});
