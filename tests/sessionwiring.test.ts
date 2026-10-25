import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmitter } from "../src/core/emitter.ts";
import {
  connectionControls,
  createGate,
  lateLinks,
} from "../src/collab/session.ts";

test("сэрэх үед холболт тогтохыг хүлээгээд дараа нь илгээнэ", async () => {
  let open = false;
  const gate = createGate(() => open, 200);
  let passed = false;
  const waiting = gate.wait().then(() => (passed = true));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(passed, false);
  open = true;
  gate.release();
  await waiting;
  assert.equal(passed, true);
  await gate.wait();
  open = false;
  const started = Date.now();
  await gate.wait();
  assert.ok(Date.now() - started >= 190);
});

test("унтах явцад сэрвэл холболтыг хаахгүй", async () => {
  const calls: string[] = [];
  const signal = {
    sleep: () => calls.push("sleep"),
    resume: () => calls.push("resume"),
  } as unknown as Parameters<typeof connectionControls>[0];
  const uploader = {
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
  } as unknown as Parameters<typeof connectionControls>[1];
  const controls = connectionControls(signal, uploader, createEmitter());
  controls.sleep();
  controls.resume();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["resume"]);
  controls.sleep();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["resume", "sleep"]);
});

test("session-ий холбоос бэлэн болохоос өмнө ашиглавал тодорхой алдаа өгнө", () => {
  const links = lateLinks();
  assert.equal(links.peek(), null);
  assert.throws(() => links.get(), /not ready/);
  const ready = {} as Parameters<typeof links.set>[0];
  links.set(ready);
  assert.equal(links.get(), ready);
  assert.equal(links.peek(), ready);
});
