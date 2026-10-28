import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

const g = globalThis as Record<string, unknown>;
g.__VITE_ENV__ = {
  BASE_URL: "/",
  DEV: false,
  PROD: true,
  MODE: "test",
  VITE_TEX_PACKAGES_URL: "https://pkg.test//",
};

const XZ = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 1, 2, 3]);
const INDEX = {
  packages: {
    big: [100, [], ["a.sty", "b.sty"]],
    small: [10, ["x.map"], ["a.sty"]],
    broken: [5, [], ["c.sty"]],
    missing: [5, [], ["d.sty"]],
    plain: [5, [], ["e.sty"]],
    offline: [5, [], ["f.sty"]],
  },
};

let indexStatus = 500;
const fetched: string[] = [];
g.fetch = async (input: string) => {
  const url = String(input);
  fetched.push(url);
  if (url.startsWith("/tex/packages-"))
    return indexStatus === 200
      ? Response.json(INDEX)
      : new Response(null, { status: indexStatus });
  const name = /2026\/(\w+)\.tar\.xz$/.exec(url)?.[1];
  if (name === "missing") return new Response(null, { status: 404 });
  if (name === "plain") return new Response(new Uint8Array([1, 2, 3]));
  if (name === "offline") throw new TypeError("network");
  if (name === "teapot") return new Response(null, { status: 418 });
  return new Response(XZ.slice());
};

const stored = new Map<string, Uint8Array>();
const deleted: string[] = [];
const fakeCache = {
  match: async (url: string) =>
    stored.has(url) ? new Response(stored.get(url)!.slice()) : undefined,
  put: async (url: string, response: Response) => {
    stored.set(url, new Uint8Array(await response.arrayBuffer()));
  },
  keys: async () => [...stored.keys()].map((url) => new Request(url)),
  delete: async (request: Request | string) => {
    const url = typeof request === "string" ? request : request.url;
    deleted.push(url);
    return stored.delete(url);
  },
};
g.caches = { open: async () => fakeCache };

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(message: { id: number; keep: string[] }): void {
    queueMicrotask(() => {
      if (message.keep.includes("c.sty")) {
        this.onmessage?.({ data: { id: message.id, error: "bad" } });
        return;
      }
      this.onmessage?.({
        data: {
          id: message.id,
          value: message.keep.map((file) => [file, new Uint8Array([7])]),
        },
      });
    });
  }
  terminate(): void {}
}
g.Worker = FakeWorker;

const tex = await import("../src/tex/texfetch.ts");

const url = (name: string): string =>
  "https://pkg.test/2026/" + name + ".tar.xz";

test("texfetch: жагсаалт татаж чадахгүй бол тодорхой алдаа өгч, дараа нь дахин оролдоно", async () => {
  assert.equal(tex.packagesEnabled(), true);
  await assert.rejects(
    tex.packagesFor(["a.sty"], () => false),
    {
      name: "TexPackageError",
    },
  );
  indexStatus = 200;
  assert.deepEqual(
    await tex.packagesFor(["a.sty", "b.sty", "zzz.sty"], () => false),
    ["small", "big"],
  );
  assert.deepEqual(
    await tex.packagesFor(["a.sty"], (name) => name === "small"),
    [],
  );
});

test("texfetch: багцыг татаж, задлаад кэшлэнэ, дараагийн удаа кэшээс авна", async () => {
  resetStorage();
  const pkg = await tex.loadPackage("small");
  assert.deepEqual([...pkg.files.keys()], ["a.sty"]);
  assert.deepEqual(pkg.maps, ["x.map"]);
  assert.ok(stored.has(url("small")));
  const meta = JSON.parse(localStorage.getItem("tex-packages:meta")!);
  assert.equal(meta.small.size, XZ.length);
  const before = fetched.length;
  await tex.loadPackage("small");
  assert.equal(fetched.length, before);
});

test("texfetch: 30 хоногоос хуучин, хэмжээ хэтэрсэн багцыг кэшээс цэвэрлэнэ", async () => {
  resetStorage();
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    "tex-packages:meta",
    JSON.stringify({
      stale: { size: 1, used: old },
      huge: { size: 40 * 1024 * 1024, used: Date.now() - 1000 },
      keep: { size: 1, used: Date.now() },
    }),
  );
  for (const name of ["stale", "huge", "keep", "stray"])
    stored.set(url(name), new Uint8Array([1]));
  await tex.loadPackage("big");
  const meta = JSON.parse(localStorage.getItem("tex-packages:meta")!);
  assert.deepEqual(Object.keys(meta).sort(), ["big", "keep"]);
  for (const name of ["big", "keep"]) assert.ok(stored.has(url(name)), name);
  for (const name of ["stale", "huge", "stray"])
    assert.ok(!stored.has(url(name)), name);
});

test("texfetch: олдохгүй, эвдэрсэн, сүлжээгүй багц бүрт өөр алдаа өгнө", async () => {
  await assert.rejects(tex.loadPackage("nope"), /олдсонгүй/);
  await assert.rejects(tex.loadPackage("missing"), /олдсонгүй/);
  await assert.rejects(tex.loadPackage("plain"), /эвдэрсэн/);
  await assert.rejects(tex.loadPackage("offline"), /интернэт/);
  await assert.rejects(tex.loadPackage("broken"), /эвдэрсэн/);
  assert.ok(deleted.includes(url("broken")));
});

test("texfetch: саяхан унасан багцыг дахин татахгүй, ижил алдааг буцаана", async () => {
  const first = await tex.loadPackage("missing").catch((error) => error);
  const count = fetched.length;
  const second = await tex.loadPackage("missing").catch((error) => error);
  assert.equal(second, first);
  assert.equal(fetched.length, count);
});
