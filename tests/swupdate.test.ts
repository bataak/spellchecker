import { test } from "node:test";
import assert from "node:assert/strict";
import { activateWaiting, waitingReady } from "../src/app/swupdate.ts";

class FakeWorker {
  state: string;
  readonly sent: unknown[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(state: string) {
    this.state = state;
  }
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  addEventListener(_: "statechange", listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_: "statechange", listener: () => void): void {
    this.listeners.delete(listener);
  }
  become(state: string): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

function registration(init: {
  installing?: FakeWorker | null;
  waiting?: FakeWorker | null;
  onUpdate?: () => void;
}) {
  return {
    installing: init.installing ?? null,
    waiting: init.waiting ?? null,
    updates: 0,
    async update() {
      this.updates++;
      init.onUpdate?.();
    },
  };
}

const never = async () => false;
const soon = () => Date.now() + 2000;

test("waitingReady хүлээж буй шинэ worker байвал бэлэн гэж үзнэ", async () => {
  const reg = registration({ waiting: new FakeWorker("installed") });
  assert.equal(await waitingReady(reg, never, soon(), 1), true);
  assert.equal(reg.updates, 0);
});

test("waitingReady суулгаж буй worker суутал хүлээж, SKIP_WAITING илгээхгүй", async () => {
  const worker = new FakeWorker("installing");
  const reg = registration({ installing: worker });
  setTimeout(() => {
    reg.installing = null;
    reg.waiting = worker;
    worker.become("installed");
  }, 5);
  assert.equal(await waitingReady(reg, never, soon(), 1), true);
  assert.deepEqual(worker.sent, []);
});

test("waitingReady шинэ worker олдоогүй бол update дуудаж, хугацаа дуусахад false", async () => {
  const reg = registration({});
  assert.equal(await waitingReady(reg, never, Date.now() + 30, 5), false);
  assert.ok(reg.updates > 0);
});

test("waitingReady шинэ хувилбар аль хэдийн үйлчилж байвал true", async () => {
  const reg = registration({});
  assert.equal(await waitingReady(reg, async () => true, soon(), 1), true);
});

test("activateWaiting хүлээж буй worker-т SKIP_WAITING илгээж, controllerchange-ийг хүлээнэ", async () => {
  const worker = new FakeWorker("installed");
  let fire: () => void = () => {};
  const container = {
    addEventListener(_: "controllerchange", listener: () => void) {
      fire = listener;
    },
  };
  let done = false;
  const run = activateWaiting(
    registration({ waiting: worker }),
    container,
    2000,
  ).then(() => {
    done = true;
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(worker.sent, [{ type: "SKIP_WAITING" }]);
  assert.equal(done, false);
  fire();
  await run;
  assert.equal(done, true);
});

test("activateWaiting хүлээж буй worker байхгүй бол юу ч хийхгүй", async () => {
  const container = {
    addEventListener() {
      throw new Error("unused");
    },
  };
  await activateWaiting(null, container);
  await activateWaiting(registration({}), container);
});
