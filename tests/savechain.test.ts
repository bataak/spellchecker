import test from "node:test";
import assert from "node:assert/strict";

import { createSaveChain } from "../src/ui/savechain.ts";

function button() {
  const listeners: ((event: unknown) => void)[] = [];
  return {
    addEventListener: (_type: string, fn: (event: unknown) => void) =>
      void listeners.push(fn),
    click: (shiftKey = false) => listeners.forEach((fn) => fn({ shiftKey })),
  };
}

test("saveChain: intercept алхам handle-ээс өмнө ажиллана", () => {
  const calls: string[] = [];
  const chain = createSaveChain(null);
  chain.handle(() => {
    calls.push("save");
    return true;
  });
  chain.intercept(({ shift }) => {
    calls.push("export?" + shift);
    return shift;
  });
  chain.run({ shift: false });
  chain.run({ shift: true });
  assert.deepEqual(calls, ["export?false", "save", "export?true"]);
});

test("saveChain: товч дарахад Shift-ийг дамжуулна", () => {
  const seen: boolean[] = [];
  const target = button();
  const chain = createSaveChain(target as unknown as HTMLElement);
  chain.handle(({ shift }) => {
    seen.push(shift);
    return true;
  });
  target.click();
  target.click(true);
  assert.deepEqual(seen, [false, true]);
});

test("saveChain: буцаасан функцээр алхмыг хасна", () => {
  const calls: string[] = [];
  const chain = createSaveChain(null);
  const release = chain.intercept(() => {
    calls.push("export");
    return true;
  });
  chain.handle(() => {
    calls.push("save");
    return true;
  });
  chain.run({ shift: true });
  release();
  chain.run({ shift: true });
  assert.deepEqual(calls, ["export", "save"]);
});
