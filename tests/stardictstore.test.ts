import test from "node:test";
import assert from "node:assert/strict";

const g = globalThis as Record<string, unknown>;
g.__STARDICT_INDEX__ = [
  { base: "good", label: "Сайн", version: "1" },
  { base: "flaky", label: "Тогтворгүй", version: "1" },
];

const encoder = new TextEncoder();

function idxOf(words: string[]): Uint8Array<ArrayBuffer> {
  const rows = words.map((word, index) => {
    const bytes = encoder.encode(word);
    const row = new Uint8Array(bytes.length + 9);
    row.set(bytes);
    const view = new DataView(row.buffer);
    view.setUint32(bytes.length + 1, index * 4);
    view.setUint32(bytes.length + 5, 4);
    return row;
  });
  const out = new Uint8Array(rows.reduce((sum, row) => sum + row.length, 0));
  let at = 0;
  for (const row of rows) {
    out.set(row, at);
    at += row.length;
  }
  return out;
}

const ifo = (name: string): string =>
  "StarDict's dict ifo file\nversion=3.0.0\nbookname=" +
  name +
  "\nwordcount=2\nidxfilesize=1\nsametypesequence=m\n";

let flakyUp = false;
const served: string[] = [];
g.fetch = async (input: string) => {
  const url = String(input);
  served.push(url);
  const [, base, ext] = /\/sd\/(\w+)(\.\w+)$/.exec(url) ?? [];
  if (base === "flaky" && !flakyUp) return new Response("", { status: 404 });
  if (ext === ".ifo")
    return new Response(ifo(base === "good" ? "Good" : "Flaky"));
  if (ext === ".idx")
    return new Response(
      idxOf(base === "good" ? ["book", "cat"] : ["ном", "үг"]),
    );
  if (ext === ".dict") return new Response(encoder.encode("abcdefgh"));
  return new Response("", { status: 404 });
};

const { createStarDictStore, isLatinDict } =
  await import("../src/dict/stardictstore.ts");

const quiet = console.warn;

function store() {
  const scripts: boolean[] = [];
  const s = createStarDictStore({
    dir: () => "/sd/",
    onScripts: (latin) => scripts.push(latin),
  });
  return { s, scripts };
}

test("stardictStore: ачаалагдсан толийг жагсааж, унасныг дараа нь нөхөж ачаална", async () => {
  console.warn = () => {};
  try {
    const { s, scripts } = store();
    await s.ensure();
    assert.deepEqual(
      s.loaded().map((entry) => entry.id),
      ["bundled:Good"],
    );
    assert.equal(isLatinDict(s.dicts()[0]!), true);
    assert.deepEqual(scripts, [true]);
    flakyUp = true;
    const before = served.length;
    await s.ensure();
    assert.equal(served.length, before);
    s.online();
    await s.ensure();
    assert.deepEqual(
      s.loaded().map((entry) => entry.id),
      ["bundled:Good", "bundled:Flaky"],
    );
    assert.equal(isLatinDict(s.dicts()[1]!), false);
    await s.reorder();
    assert.equal(s.dicts().length, 2);
  } finally {
    console.warn = quiet;
    flakyUp = false;
  }
});

test("stardictStore: уншихад эвдэрсэн толийг хасаж, дахин ачаалаад дахин ажиллуулна", async () => {
  flakyUp = true;
  try {
    const { s } = store();
    const seen: number[] = [];
    const result = await s.withDicts(async (dicts, broken) => {
      seen.push(dicts.length);
      if (seen.length === 1) broken.push(dicts[0]!);
      return seen.length;
    });
    assert.equal(result, 2);
    assert.deepEqual(seen, [2, 2]);
    assert.equal(await s.withDicts(async (dicts) => dicts.length), 2);
  } finally {
    flakyUp = false;
  }
});

test("stardictStore: reset хийхэд хоосолж, дахин ачаалахад шинээр уншина", async () => {
  flakyUp = true;
  try {
    const { s, scripts } = store();
    await s.ensure();
    s.reset();
    assert.deepEqual(s.dicts(), []);
    assert.equal(scripts.at(-1), false);
    await s.ensure();
    assert.equal(s.dicts().length, 2);
  } finally {
    flakyUp = false;
  }
});
