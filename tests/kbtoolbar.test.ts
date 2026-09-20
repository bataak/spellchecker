import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeyboardOpen, keyboardInset } from "../src/kbtoolbar.ts";

test("гарын өндрийг visualViewport-оос тооцно", () => {
  assert.equal(keyboardInset(844, { height: 844, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 0 }), 336);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 120 }), 216);
  assert.equal(keyboardInset(844, { height: 900, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(844, null), 0);
});

test("хаягийн мөрийн өөрчлөлтийг keyboard гэж андуурахгүй", () => {
  assert.equal(
    isKeyboardOpen(keyboardInset(844, { height: 790, offsetTop: 0 })),
    false,
  );
  assert.equal(
    isKeyboardOpen(keyboardInset(844, { height: 508, offsetTop: 0 })),
    true,
  );
});
