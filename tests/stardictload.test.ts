import test from "node:test";
import assert from "node:assert/strict";

import { memoryBytes } from "../src/dictbytes.ts";
import { openStarDict } from "../src/stardict.ts";
import {
  checkCoverage,
  DictReadError,
  fetchWith,
  guardReads,
  loadStarDict,
  loadStarDicts,
} from "../src/stardictload.ts";

const encoder = new TextEncoder();

function buildIdx(entries: { word: string; offset: number; size: number }[]) {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    const word = encoder.encode(entry.word);
    const row = new Uint8Array(word.length + 1 + 8);
    row.set(word, 0);
    const view = new DataView(row.buffer);
    view.setUint32(word.length + 1, entry.offset);
    view.setUint32(word.length + 5, entry.size);
    parts.push(row);
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const dictText = encoder.encode("бичсэн зүйлзаадаг хүн");
const idx = buildIdx([
  { word: "НОМ", offset: 0, size: 21 },
  { word: "багш", offset: 21, size: 19 },
]);
const ifo =
  "StarDict's dict ifo file\nversion=3.0.0\nbookname=Тест\n" +
  "wordcount=2\nidxfilesize=1\nsametypesequence=m\n";

type Handler = (url: string) => Response | Promise<Response>;

async function withFetch<T>(
  handler: Handler,
  run: (calls: string[]) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const ok = (body: BodyInit): Response =>
  new Response(body, { status: 200, headers: { "content-type": "text/plain" } });

const missing = (): Response => new Response("", { status: 404 });

function serveDict(base: string): Handler {
  return (url) => {
    if (url === base + ".ifo") return ok(ifo);
    if (url === base + ".idx") return ok(idx.slice());
    if (url === base + ".dict") return ok(dictText.slice());
    return missing();
  };
}

test("fetchWith — түр алдааны дараа дахин оролдоно", async () => {
  let attempts = 0;
  const text = await withFetch(
    () => {
      attempts++;
      if (attempts === 1) throw new TypeError("network");
      if (attempts === 2) return new Response("", { status: 503 });
      return ok("сайн");
    },
    () => fetchWith("x", (res) => res.text(), [0, 0]),
  );
  assert.equal(text, "сайн");
  assert.equal(attempts, 3);
});

test("fetchWith — 404 бол дахин оролдохгүй, null буцаана", async () => {
  const result = await withFetch(missing, async (calls) => {
    const value = await fetchWith("x", (res) => res.text(), [0, 0]);
    assert.equal(calls.length, 1);
    return value;
  });
  assert.equal(result, null);
});

test("fetchWith — оролдлого дуусвал алдаа шиднэ", async () => {
  await withFetch(
    () => {
      throw new TypeError("offline");
    },
    async (calls) => {
      await assert.rejects(fetchWith("x", (res) => res.text(), [0, 0]));
      assert.equal(calls.length, 3);
    },
  );
});

test("fetchWith — html хариуг алга гэж үзнэ", async () => {
  const result = await withFetch(
    () =>
      new Response("<html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    () => fetchWith("x", (res) => res.text(), []),
  );
  assert.equal(result, null);
});

test("checkCoverage — dict файл дутуу бол алдаа", () => {
  const full = openStarDict(ifo, idx, memoryBytes(dictText));
  assert.doesNotThrow(() => checkCoverage(full));
  const short = openStarDict(ifo, idx, memoryBytes(dictText.subarray(0, 30)));
  assert.throws(() => checkCoverage(short));
});

test("guardReads — уншилтын алдааг DictReadError болгоно", async () => {
  const bytes = guardReads({
    size: 10,
    read: () => Promise.reject(new Error("NotReadableError")),
  });
  await assert.rejects(bytes.read(0, 1), DictReadError);
});

test("loadStarDict — сүлжээнээс татаж нээнэ", async () => {
  const dict = await withFetch(serveDict("d/t"), () => loadStarDict("d/t"));
  assert.equal(dict?.info.bookname, "Тест");
  assert.equal(dict?.index.starts.length, 2);
});

test("loadStarDict — дутуу dict файлыг хүлээж авахгүй", async () => {
  await withFetch(
    (url) =>
      url === "d/t.dict" ? ok(dictText.slice(0, 30)) : serveDict("d/t")(url),
    async () => {
      await assert.rejects(loadStarDict("d/t"));
    },
  );
});

test("loadStarDicts — амжилтгүй толийг failed-д буцаана", async () => {
  const list = [
    { base: "good", label: "good", version: "" },
    { base: "bad", label: "bad", version: "" },
  ];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await withFetch(
      (url) => {
        if (url.startsWith("dir/bad")) throw new TypeError("offline");
        return serveDict("dir/good")(url);
      },
      () => loadStarDicts("dir/", list),
    );
    assert.deepEqual(
      result.loaded.map(({ entry }) => entry.base),
      ["good"],
    );
    assert.deepEqual(
      result.failed.map((entry) => entry.base),
      ["bad"],
    );
  } finally {
    console.warn = warn;
  }
});
