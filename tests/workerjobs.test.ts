import { test } from "node:test";
import assert from "node:assert/strict";
import { workerJobs } from "../src/core/workerjobs.ts";

type Sent = { id: number; n: number };

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sent: Sent[] = [];
  terminated = false;
  postMessage(message: Sent): void {
    this.sent.push(message);
  }
  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
  terminate(): void {
    this.terminated = true;
  }
}

function setup(timeoutMs = 1000) {
  const made: FakeWorker[] = [];
  const run = workerJobs<{ n: number }, number>(
    () => {
      const fake = new FakeWorker();
      made.push(fake);
      return fake as unknown as Worker;
    },
    "job",
    timeoutMs,
  );
  return { made, run };
}

test("workerJobs: хариуг id-аар нь тааруулж, worker-ийг дахин ашиглана", async () => {
  const { made, run } = setup();
  const first = run({ n: 1 });
  const second = run({ n: 2 });
  assert.equal(made.length, 1);
  const [a, b] = made[0]!.sent;
  made[0]!.reply({ id: b!.id, value: 20 });
  made[0]!.reply({ id: a!.id, error: "bad" });
  assert.equal(await second, 20);
  await assert.rejects(first, /bad/);
});

test("workerJobs: алдаа гарвал бүх ажлыг цуцалж, дараагийн удаа шинэ worker үүсгэнэ", async () => {
  const { made, run } = setup();
  const pending = run({ n: 1 });
  made[0]!.onerror?.();
  await assert.rejects(pending, /^Error: job$/);
  assert.ok(made[0]!.terminated);
  const again = run({ n: 2 });
  assert.equal(made.length, 2);
  made[1]!.reply({ id: made[1]!.sent[0]!.id, value: 5 });
  assert.equal(await again, 5);
});

test("workerJobs: хугацаа хэтэрвэл worker-ийг зогсоож, хуучин worker-ийн алдааг үл тооно", async () => {
  const { made, run } = setup(5);
  await assert.rejects(run({ n: 1 }), /job timeout/);
  assert.ok(made[0]!.terminated);
  const fresh = run({ n: 2 });
  made[0]!.onerror?.();
  made[1]!.reply({ id: made[1]!.sent[0]!.id, value: 7 });
  assert.equal(await fresh, 7);
});
