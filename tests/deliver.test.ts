import { test } from "node:test";
import assert from "node:assert/strict";
import { deliver } from "../src/office/mode.ts";

test("share цонхыг цуцлахад амжилт гэж тооцохгүй", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      canShare: () => true,
      share: () => Promise.reject(new DOMException("cancelled", "AbortError")),
    },
  });
  try {
    const result = await deliver(new Uint8Array([1, 2, 3]), "a.docx", "docx");
    assert.equal(result, "cancelled");
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
  }
});
