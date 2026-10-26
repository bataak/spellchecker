import test from "node:test";
import assert from "node:assert/strict";

import { createSpellers, PRIMARY } from "../src/spell/spellers.ts";
import type { SpellerInstance } from "../src/spell/backend.ts";

const encoder = new TextEncoder();
const MANIFEST = {
  dicts: [
    { id: "mn_MN", version: "1", aff: "mn.aff", dic: "mn.dic" },
    { id: "en_US", version: null, aff: "en.aff", dic: "en.dic" },
  ],
};

const AFF = "SET UTF-8\n";
const DIC = "5000\n" + "үг\n".repeat(40000);

const respond = (body: unknown): Response =>
  new Response(
    typeof body === "string" ? encoder.encode(body) : JSON.stringify(body),
  );

function setup(fresh: unknown = MANIFEST) {
  const built: string[] = [];
  const disposed: string[] = [];
  const updates: string[] = [];
  const instance = (id: string, tag: string): SpellerInstance => ({
    spell: () => true,
    suggest: () => [],
    dispose: () => disposed.push(id + tag),
  });
  Object.assign(globalThis, {
    fetch: async (url: string) =>
      url.endsWith(".json") ? respond(MANIFEST) : respond("# Version: 9\n"),
    caches: { match: async () => undefined },
  });
  const spellers = createSpellers({
    asset: (path) => "/" + path,
    netFetch: (async (url: string) =>
      String(url).includes("manifest")
        ? respond(fresh)
        : respond(String(url).endsWith(".aff") ? AFF : DIC)) as typeof fetch,
    onUpdated: (id, version) => updates.push(id + "@" + version),
    backend: async () => ({
      label: "fake",
      build: async (_aff, _dic, id) => {
        built.push(id!);
        return instance(id!, String(built.length));
      },
    }),
  });
  return { spellers, built, disposed, updates };
}

test("spellers: manifest-аас толь ачаалж, идэвхтэйг шүүнэ", async () => {
  const { spellers, built } = setup();
  assert.equal((await spellers.start()).label, "fake");
  await spellers.load("en_US");
  await spellers.load(PRIMARY);
  assert.deepEqual(built, ["en_US", "mn_MN"]);
  assert.equal(spellers.version(), "1");
  assert.deepEqual(
    spellers.active().map((s) => s.id),
    ["mn_MN", "en_US"],
  );
  spellers.setActive([]);
  assert.deepEqual(
    spellers.active().map((s) => s.id),
    ["mn_MN"],
  );
  assert.ok(spellers.primary());
  await assert.rejects(spellers.load("xx"), /manifest-д алга/);
});

test("spellers: шинэ хувилбар гарвал үндсэн толийг сольж хуучныг чөлөөлнө", async () => {
  const fresh = {
    dicts: [{ id: "mn_MN", version: "2", aff: "mn.aff", dic: "mn.dic" }],
  };
  const { spellers, disposed, updates } = setup(fresh);
  await spellers.start();
  await spellers.load(PRIMARY);
  await spellers.refresh();
  assert.deepEqual(updates, ["mn_MN@2"]);
  assert.deepEqual(disposed, ["mn_MN1"]);
  assert.equal(spellers.version(), "2");
  await spellers.refresh();
  assert.deepEqual(updates, ["mn_MN@2"]);
});
