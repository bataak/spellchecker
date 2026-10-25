import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { createIceKeeper, iceRefreshMs } from "../src/collab/ice.ts";

test("TURN эрх сунгах хүсэлтэд хариу ирэхгүй бол дахин асууна", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let requests = 0;
    const keeper = createIceKeeper(() => ({
      signal: { command: () => (requests++, true) },
      mesh: { refresh: () => {} },
    }));
    const turn = [{ urls: ["turn:t"], username: "u", credential: "c" }];
    keeper.take({ ice: turn, life: 7200 });
    mock.timers.tick(iceRefreshMs(7200));
    assert.equal(requests, 1);
    mock.timers.tick(5 * 60_000);
    assert.equal(requests, 2);
    mock.timers.tick(5 * 60_000);
    assert.equal(requests, 3);
    keeper.take({ ice: turn, life: 7200 });
    mock.timers.tick(5 * 60_000);
    assert.equal(requests, 3);
    mock.timers.tick(iceRefreshMs(7200));
    assert.equal(requests, 4);
    keeper.stop();
    mock.timers.tick(60 * 60_000);
    assert.equal(requests, 4);
  } finally {
    mock.timers.reset();
  }
});
