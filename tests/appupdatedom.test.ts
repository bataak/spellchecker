import { resetSession, resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<button id="appReloadBtn" hidden></button><span id="appVersion"></span>',
);
const g = globalThis as Record<string, unknown>;
g.__APP_VERSION__ = "1.2.3";
g.__HUNSPELL_VERSION__ = "1.7";
g.location = dom.window.location;

const { initAppUpdate } = await import("../src/app/appupdate.ts");

test.after(() => dom.close());

test("appUpdate: хувилбарыг богино харуулж, дарахад дэлгэрэнгүй, толины хувилбарыг нэмнэ", () => {
  resetStorage();
  const update = initAppUpdate(
    () => {},
    "http://localhost/assets/index-a.js",
    "/",
  );
  const label = document.querySelector<HTMLElement>("#appVersion")!;
  assert.equal(label.textContent, "v1.2.3");
  update.setDictVersion("2026.10");
  assert.equal(label.textContent, "v1.2.3");
  label.click();
  assert.equal(label.textContent, "v1.2.3 · hunspell 1.7 · mn_MN 2026.10");
  update.setDictVersion("2026.11");
  assert.equal(label.textContent, "v1.2.3 · hunspell 1.7 · mn_MN 2026.11");
  label.click();
  assert.equal(label.textContent, "v1.2.3");
});

const reloads: number[] = [];
Object.defineProperty(dom.window.location, "reload", {
  value: () => reloads.push(1),
  configurable: true,
});
const statuses: string[] = [];
const reloadBtn = () => document.querySelector<HTMLElement>("#appReloadBtn")!;
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function serveEntry(entry: string, during?: () => void): void {
  (globalThis as Record<string, unknown>).fetch = async (url: string) => {
    if (during) {
      await wait(2);
      during();
    }
    return {
      ok: true,
      text: async () =>
        url.includes("sw.js") ? 'precache("assets/' + entry + '")' : entry,
    };
  };
}

function fresh(entry = "index-old.js") {
  resetStorage();
  resetSession();
  reloads.length = 0;
  statuses.length = 0;
  reloadBtn().hidden = true;
  return initAppUpdate(
    (html) => statuses.push(html),
    "http://localhost/assets/" + entry,
    "/",
  );
}

test("appUpdate: шинэ хувилбар гарвал ↻ товчийг харуулна, ижил бол нууна", async () => {
  serveEntry("index-old.js");
  await fresh().checkFreshness();
  assert.equal(reloadBtn().hidden, true);
  serveEntry("index-new.js");
  await fresh().checkFreshness();
  assert.equal(reloadBtn().hidden, false);
  assert.deepEqual(reloads, []);
});

test("appUpdate: хуучирсан хувилбараас нэг л удаа дахин ачаална", async () => {
  serveEntry("index-new.js");
  assert.equal(await fresh().recoverStale(), true);
  await wait();
  assert.deepEqual(statuses, ["Шинэ хувилбарыг ачаалж байна…"]);
  assert.equal(reloads.length, 1);
  const again = initAppUpdate(
    () => {},
    "http://localhost/assets/index-old.js",
    "/",
  );
  assert.equal(await again.recoverStale(), false);
  assert.equal(reloads.length, 1);
});

test("appUpdate: хэрэглэгч идэвхтэй бол дахин ачаалахгүй, ↻ товч харуулна", async () => {
  serveEntry("index-new.js", () =>
    document.dispatchEvent(new KeyboardEvent("keydown")),
  );
  const update = fresh();
  await wait(5);
  assert.equal(await update.recoverStale(true), false);
  assert.equal(reloadBtn().hidden, false);
  assert.deepEqual(reloads, []);
});

test("appUpdate: chunk ачаалагдахгүй бол мэдэгдэж, ↻ товчоор шинэчилнэ", async () => {
  serveEntry("index-new.js");
  fresh();
  window.dispatchEvent(new Event("vite:preloadError"));
  await wait(10);
  assert.equal(reloadBtn().hidden, false);
  assert.match(statuses.at(-1) ?? "", /↻ товчийг дарж/);
  reloadBtn().click();
  await wait(10);
  assert.equal(reloadBtn().hidden, true);
  assert.equal(statuses.at(-1), "Шинэ хувилбарыг ачаалж байна…");
  assert.ok(reloads.length > 0);
});
