import test from "node:test";
import assert from "node:assert/strict";

import { MAX_FRAMES, safeFrame, toSafeError } from "../src/safeerror.ts";
import { attachErrorLog, createErrorRing } from "../src/errorlog.ts";

const CYR = "НУУЦмаркер";
const LAT = "SECRETmarker";

function assertClean(value: unknown): void {
  const json = JSON.stringify(value);
  assert.ok(!json.includes(CYR), json);
  assert.ok(!json.includes(LAT), json);
}

function withStack(name: string, stack: string, message = ""): Error {
  const e = new Error(message);
  e.name = name;
  Object.defineProperty(e, "stack", { value: stack });
  return e;
}

const CHROME = [
  `TypeError: Cannot read ${CYR} ${LAT} of undefined`,
  `    at render (https://aldaa.bichig.dev/assets/index-Ab12Cd.js:12:345)`,
  `    at async boot (https://aldaa.bichig.dev/assets/index-Ab12Cd.js:1:99)`,
  `    at https://aldaa.bichig.dev/assets/worker-Zz9.js:3:4`,
  `    at Array.forEach (<anonymous>)`,
].join("\n");

const FIREFOX = [
  `render@https://aldaa.bichig.dev/assets/index-Ab12Cd.js:12:345`,
  `boot/<@https://aldaa.bichig.dev/assets/index-Ab12Cd.js:1:99`,
  `@https://aldaa.bichig.dev/assets/worker-Zz9.js:3:4`,
  ``,
].join("\n");

test("toSafeError: Chrome stack-аас зөвхөн файл:мөр:багана үлдэнэ", () => {
  const safe = toSafeError(withStack("TypeError", CHROME, `${CYR} ${LAT}`));
  assert.deepEqual(safe, {
    name: "TypeError",
    code: null,
    frames: [
      "index-Ab12Cd.js:12:345",
      "index-Ab12Cd.js:1:99",
      "worker-Zz9.js:3:4",
    ],
  });
  assertClean(safe);
});

test("toSafeError: Firefox stack-аас зөвхөн файл:мөр:багана үлдэнэ", () => {
  const safe = toSafeError(withStack("RangeError", FIREFOX, `${CYR} ${LAT}`));
  assert.deepEqual(safe.frames, [
    "index-Ab12Cd.js:12:345",
    "index-Ab12Cd.js:1:99",
    "worker-Zz9.js:3:4",
  ]);
  assertClean(safe);
});

test("toSafeError: message-ийг огт уншихгүй", () => {
  const e = new Error("x");
  Object.defineProperty(e, "message", {
    get() {
      throw new Error("message уншигдлаа");
    },
  });
  assert.doesNotThrow(() => toSafeError(e));
});

test("toSafeError: stack доторх frame биш мөр, файлын нэр дэх текст гарахгүй", () => {
  const stack = [
    `Error: ${CYR}`,
    `    at f (https://aldaa.bichig.dev/${CYR}/${LAT}.txt:1:2)`,
    `    at g (https://aldaa.bichig.dev/${encodeURIComponent(CYR)}.js:1:2)`,
    `    at h (https://aldaa.bichig.dev/a/main.js?q=${LAT}:5:6)`,
    `${LAT}@${CYR}:1:2`,
  ].join("\n");
  const safe = toSafeError(withStack("Error", stack));
  assert.deepEqual(safe.frames, ["main.js:5:6"]);
  assertClean(safe);
});

test("toSafeError: frame хамгийн ихдээ 8", () => {
  const lines = ["Error"];
  for (let i = 0; i < 20; i++)
    lines.push(`    at f (https://x.dev/a.js:${i}:1)`);
  const safe = toSafeError(withStack("Error", lines.join("\n")));
  assert.equal(safe.frames.length, MAX_FRAMES);
  assert.equal(safe.frames[0], "a.js:0:1");
});

test("toSafeError: name болон code regex-ийг давахгүй бол null", () => {
  const bad = withStack(`Bad ${LAT}`, "");
  Object.assign(bad, { code: `E_${CYR}` });
  assert.deepEqual(toSafeError(bad), { name: null, code: null, frames: [] });

  const good = withStack("AbortError", "");
  Object.assign(good, { code: "DICT_LOAD_FAILED" });
  assert.deepEqual(toSafeError(good), {
    name: "AbortError",
    code: "DICT_LOAD_FAILED",
    frames: [],
  });
});

test("toSafeError: удамшсан code-ийг авахгүй", () => {
  const proto = { code: "INHERITED_CODE", name: "Error" };
  const e = Object.create(proto) as object;
  assert.equal(toSafeError(e).code, null);
});

test("toSafeError: string, null, getter алдаа", () => {
  assert.deepEqual(toSafeError(`${CYR} ${LAT}`), {
    name: null,
    code: null,
    frames: [],
  });
  assert.deepEqual(toSafeError(null), { name: null, code: null, frames: [] });
  const hostile = {
    get name(): string {
      throw new Error("x");
    },
    get stack(): string {
      throw new Error("x");
    },
  };
  assert.deepEqual(toSafeError(hostile), {
    name: null,
    code: null,
    frames: [],
  });
});

test("safeFrame: зөвшөөрөгдөөгүй утгыг хаяна", () => {
  assert.equal(safeFrame("https://x.dev/a.js", 1, 2), "a.js:1:2");
  assert.equal(safeFrame("https://x.dev/a.js", "1x", 2), null);
  assert.equal(safeFrame(`https://x.dev/${LAT}`, 1, 2), null);
  assert.equal(safeFrame(undefined, 1, 2), null);
});

test("errorlog: сүүлийн 5-ыг SafeError хэлбэрээр хадгална", () => {
  const ring = createErrorRing();
  const target = new EventTarget();
  attachErrorLog(target, ring);
  for (let i = 0; i < 7; i++) {
    const ev = new Event("error");
    Object.assign(ev, {
      error: withStack(
        "Error",
        `Error: ${CYR}\n    at f (https://x.dev/a.js:${i}:1)`,
      ),
      message: `${CYR} ${LAT}`,
    });
    target.dispatchEvent(ev);
  }
  const rej = new Event("unhandledrejection");
  Object.assign(rej, { reason: `${LAT} ${CYR}` });
  target.dispatchEvent(rej);

  const list = ring.list();
  assert.equal(list.length, 5);
  assert.deepEqual(list[0]!.frames, ["a.js:3:1"]);
  assert.deepEqual(list[4], { name: null, code: null, frames: [] });
  assertClean(list);
});

test("errorlog: error байхгүй event-ээс filename/lineno-г ашиглана", () => {
  const ring = createErrorRing();
  const target = new EventTarget();
  attachErrorLog(target, ring);
  const ev = new Event("error");
  Object.assign(ev, {
    error: null,
    message: LAT,
    filename: "https://x.dev/assets/b.js",
    lineno: 4,
    colno: 7,
  });
  target.dispatchEvent(ev);
  assert.deepEqual(ring.list(), [
    { name: null, code: null, frames: ["b.js:4:7"] },
  ]);
});
