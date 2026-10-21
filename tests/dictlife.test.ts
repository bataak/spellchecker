import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");

const { createDictLife } = await import("../src/app/dictlife.ts");

test.after(() => dom.close());

interface Fake {
  init?: () => Promise<unknown>;
  stale?: boolean;
}

function setup(fake: Fake = {}) {
  const calls: string[] = [];
  let complete: (done: { failed: unknown[] }) => void = () => {};
  const checker = {
    loadedIds: ["mn_MN", "en_US"],
    mnVersion: "2",
    onFatal: null as ((reason: string) => void) | null,
    onDictUpdated: null as ((id: string) => void) | null,
    init:
      fake.init ??
      (async () => ({
        loaded: ["mn_MN"],
        failed: [],
        fallbackReason: null,
        mnVersion: "1",
      })),
    setActive: (ids: string[]) => calls.push("active:" + ids.join(",")),
    refresh: () => calls.push("refresh"),
    whenComplete: () =>
      new Promise<{ failed: unknown[] }>((resolve) => (complete = resolve)),
  };
  let ready = false;
  const life = createDictLife({
    checker: checker as never,
    dicts: {
      base: () => "base",
      setIndicating: () => {},
      active: () => ["mn_MN"],
      loaded: (ids: string[]) => calls.push("loaded:" + ids.join(",")),
      completed: (ids: string[], failed: unknown[]) =>
        calls.push("completed:" + ids.length + ":" + failed.length),
      setEnglish: (next: Set<string>) =>
        calls.push("english:" + [...next].join(",")),
    } as never,
    docStatus: {
      ready: () => ready,
      markReady: () => {
        ready = true;
      },
      showDictsIfIdle: () => calls.push("idle"),
    } as never,
    status: { set: (html: string) => calls.push("status:" + html) } as never,
    appUpdate: {
      setDictVersion: (version: string | null) =>
        calls.push("version:" + version),
      checkFreshness: async () => {
        calls.push("fresh");
      },
      recoverStale: async () => !!fake.stale,
    },
    blank: () => true,
    recheckAll: async () => {
      calls.push("recheck");
    },
  });
  return {
    life,
    calls,
    checker,
    complete: (f: unknown[]) => complete({ failed: f }),
  };
}

const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

test("dictlife: толь ачаалж, бүрэн болоход дахин шалгаж, шинэчлэлтийг шалгана", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { life, calls, checker, complete } = setup();
    await life.start();
    assert.deepEqual(calls.slice(0, 4), [
      "active:mn_MN",
      "version:1",
      "recheck",
      "loaded:mn_MN",
    ]);
    complete(["x"]);
    await settle();
    assert.ok(calls.includes("completed:2:1"));
    assert.ok(calls.includes("refresh"));
    assert.ok(calls.includes("fresh"));
    calls.length = 0;
    checker.onDictUpdated!("en_US");
    checker.onDictUpdated!("mn_MN");
    assert.deepEqual(calls, ["version:2", "recheck"]);
    calls.length = 0;
    window.dispatchEvent(new Event("online"));
    mock.timers.tick(3 * 60 * 60 * 1000);
    assert.equal(calls.includes("refresh"), false);
  } finally {
    mock.timers.reset();
  }
});

test("dictlife: толь олдохгүй, ачаалалт унах, хуучирсан хувилбар бүрийг мэдэгдэнэ", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const empty = setup({
      init: async () => ({ loaded: [], failed: [], fallbackReason: null }),
    });
    await empty.life.start();
    assert.ok(empty.calls.some((c) => c.includes("Нэг ч толь алга")));
    const broken = setup({
      init: async () => Promise.reject(new Error("<x>")),
    });
    await broken.life.start();
    assert.ok(
      broken.calls.includes("status:Ачаалахад алдаа гарлаа: &lt;x&gt;"),
    );
    const stale = setup({ init: async () => Promise.reject(1), stale: true });
    await stale.life.start();
    assert.equal(stale.calls.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("dictlife: зогссон шалгагчийг мэдэгдэж, англи толийг солино", async () => {
  const { life, calls, checker } = setup();
  life.watchFatal();
  checker.onFatal!("<crash>");
  await settle();
  assert.match(calls[0]!, /^status:Алдаа шалгагч зогслоо: &lt;crash&gt;/);
  calls.length = 0;
  life.setEnglish(new Set(["en_GB"]));
  assert.deepEqual(calls, ["english:en_GB", "active:mn_MN", "recheck", "idle"]);
  const stale = setup({ stale: true });
  stale.life.watchFatal();
  stale.checker.onFatal!("x");
  await settle();
  assert.equal(stale.calls.length, 0);
});
