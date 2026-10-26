import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";

type Reply = Record<string, unknown>;

const workers: FakeWorker[] = [];
const replies: (Reply | "hang")[] = [];
const outputs = new Map<string, string>();
const written = new Map<string, string>();

class FakeWorker {
  onmessage: ((event: { data: Reply }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sent: string[] = [];
  terminated = false;

  constructor() {
    workers.push(this);
    queueMicrotask(() => this.onmessage?.({ data: { result: "ok" } }));
  }

  postMessage(message: { cmd: string; url?: string; src?: unknown }): void {
    this.sent.push(message.cmd);
    if (message.cmd === "writefile" && typeof message.src === "string")
      written.set(message.url!, message.src);
    if (message.cmd === "readfile")
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            cmd: "readfile",
            url: message.url,
            src: outputs.get(message.url!) ?? null,
          },
        }),
      );
    if (message.cmd === "misses")
      queueMicrotask(() =>
        this.onmessage?.({ data: { cmd: "misses", names: [] } }),
      );
    if (message.cmd !== "compilelatex") return;
    const reply = replies.shift() ?? ok();
    if (reply === "hang") return;
    setTimeout(() => this.onmessage?.({ data: reply }), 1);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const pdfBytes = (tag: number) => new Uint8Array([37, 80, 68, 70, tag]).buffer;
const ok = (tag = 1): Reply => ({
  cmd: "compile",
  result: "ok",
  status: 0,
  log: "",
  pdf: pdfBytes(tag),
});

const g = globalThis as Record<string, unknown>;
g.Worker = FakeWorker;
g.location = { href: "http://localhost/" };
g.fetch = async () => ({
  ok: true,
  arrayBuffer: async () =>
    zipSync({ "pdftex.map": strToU8("map"), "article.cls": strToU8("cls") })
      .buffer,
});

const { cancelCompile, compilePdf, compileRunningFor } =
  await import("../src/tex/texpdf.ts");
const { PdfError } = await import("../src/tex/texerrors.ts");

const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const compileCount = (worker: FakeWorker) =>
  worker.sent.filter((cmd) => cmd === "compilelatex").length;

test("texEngine: ачаалсан хөдөлгүүрт багцыг бичиж хөрвүүлээд, дараагийн удаа дахин ашиглана", async () => {
  const first = await compilePdf("\\documentclass{article}");
  assert.deepEqual([...first], [37, 80, 68, 70, 1]);
  assert.equal(workers.length, 1);
  const worker = workers[0]!;
  assert.ok(worker.sent.includes("writetex"));
  assert.ok(worker.sent.includes("fonturl"));
  assert.deepEqual(worker.sent.slice(-5), [
    "flushcache",
    "writefile",
    "workdir",
    "setmainfile",
    "compilelatex",
  ]);
  replies.push(ok(2), ok(3));
  const second = await compilePdf("\\ref{x}");
  assert.deepEqual([...second], [37, 80, 68, 70, 3]);
  assert.equal(workers.length, 1);
  assert.equal(compileCount(worker), 3);
});

test("texEngine: зэрэг ирсэн хөрвүүлэлтүүдийг дараалан ажиллуулна", async () => {
  const worker = workers.at(-1)!;
  const before = compileCount(worker);
  replies.push("hang", ok(5));
  const a = compilePdf("a");
  const b = compilePdf("b");
  while (compileCount(worker) === before) await tick();
  await tick(20);
  assert.equal(compileCount(worker), before + 1);
  worker.onmessage?.({ data: ok(4) });
  assert.deepEqual([...(await a)].at(-1), 4);
  assert.deepEqual([...(await b)].at(-1), 5);
  assert.equal(compileCount(worker), before + 2);
});

test("texEngine: TeX алдааг PdfError болгож, хөдөлгүүр унавал шинээр асаана", async () => {
  replies.push({
    cmd: "compile",
    result: "failed",
    status: 3,
    log: "! Undefined control sequence.\nl.3 \\foo\n",
  });
  await assert.rejects(compilePdf("bad"), (error: unknown) => {
    assert.ok(error instanceof PdfError);
    assert.match((error as Error).message, /Undefined control sequence/);
    return true;
  });
  assert.equal(workers.length, 1);
  replies.push({ cmd: "compile", result: "failed", status: -254, log: "" });
  await assert.rejects(compilePdf("crash"), PdfError);
  assert.equal(workers[0]!.terminated, true);
  await compilePdf("again");
  assert.equal(workers.length, 2);
  assert.equal(workers[1]!.terminated, false);
});

test("texEngine: хөрвүүлэлтийг цуцлахад хөдөлгүүрийг зогсоож, дараагийнх нь шинээр асна", async () => {
  replies.push("hang");
  const job = compilePdf("slow");
  while (compileRunningFor() === 0) await tick();
  cancelCompile();
  await assert.rejects(job, /зогсоолоо/);
  assert.equal(workers.at(-1)!.terminated, true);
  assert.equal(compileRunningFor(), 0);
  const count = workers.length;
  await compilePdf("after");
  assert.equal(workers.length, count + 1);
});

test("texEngine: \\makeindex байвал индекс үүсгээд дахин хөрвүүлнэ", async () => {
  const worker = workers.at(-1)!;
  const before = compileCount(worker);
  outputs.set("main.idx", "\\indexentry{өвөл}{2}\n\\indexentry{ой}{1}\n");
  await compilePdf("\\makeindex\\begin{document}\\printindex");
  assert.equal(compileCount(worker), before + 2);
  assert.equal(
    written.get("main.ind"),
    "\\begin{theindex}\n\n  \\item ой, 1\n\n  \\indexspace\n\n  \\item өвөл, 2\n\n\\end{theindex}\n",
  );
  outputs.set("thesis.idx", "\\indexentry{a}{3}\n");
  await compilePdf(
    "\\makeindex\\ref{a}",
    {},
    {
      workdir: "book",
      main: "thesis.tex",
      dirs: ["book"],
    },
  );
  assert.equal(compileCount(worker), before + 5);
  assert.match(written.get("book/thesis.ind")!, /\\item a, 3/);
  const plain = compileCount(worker);
  await compilePdf("\\makeindex");
  assert.equal(compileCount(worker), plain + 2);
});

test("texEngine: оруулсан файл дахь \\makeindex-ийг ч илрүүлж, тайлбарыг тоохгүй", async () => {
  const worker = workers.at(-1)!;
  outputs.set("main.idx", "\\indexentry{b}{4}\n");
  written.delete("main.ind");
  const before = compileCount(worker);
  await compilePdf("\\input{pre}", { "pre.tex": "\\makeindex\n" });
  assert.equal(compileCount(worker), before + 2);
  assert.match(written.get("main.ind")!, /\\item b, 4/);
  written.delete("main.ind");
  await compilePdf("% \\makeindex\n", {
    "pre.tex": "%\\makeindex",
    "logo.png": new Uint8Array([1]),
  });
  assert.equal(compileCount(worker), before + 3);
  assert.equal(written.has("main.ind"), false);
});
