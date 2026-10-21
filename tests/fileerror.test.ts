import test from "node:test";
import assert from "node:assert/strict";

import {
  FileReadError,
  fileErrorReason,
  readFailureMessage,
} from "../src/office/fileerror.ts";
import { openOfficeMode, SIZE_LIMIT } from "../src/office/mode.ts";

const FALLBACK = "уншиж чадсангүй";

test("readFailureMessage: хэмжээний хязгаарыг алдаанаас уншина", () => {
  const error = new FileReadError({ kind: "too-large", limitMb: 20 });
  assert.equal(
    readFailureMessage(error, FALLBACK),
    "Файл хэт том байна — 20 мегабайтаас хэтэрч болохгүй",
  );
});

test("readFailureMessage: шалтгаан бүрд өөрийн мэдэгдэл", () => {
  for (const kind of [
    "unsupported",
    "unpacked-too-large",
    "no-text",
  ] as const) {
    const message = readFailureMessage(new FileReadError({ kind }), FALLBACK);
    assert.ok(message.length > 0);
    if (kind !== "unsupported") assert.notEqual(message, FALLBACK);
  }
});

test("readFailureMessage: бусад алдаанд fallback", () => {
  assert.equal(
    readFailureMessage(new Error("too-large:5"), FALLBACK),
    FALLBACK,
  );
  assert.equal(readFailureMessage("x", FALLBACK), FALLBACK);
  assert.equal(fileErrorReason(new Error("no-text")), null);
});

test("openOfficeMode: төрөлжсөн алдаа шиднэ", async () => {
  await assert.rejects(openOfficeMode(new File(["a"], "a.xyz")), (error) => {
    assert.deepEqual(fileErrorReason(error), { kind: "unsupported" });
    return true;
  });
  const big = new File([new Uint8Array(SIZE_LIMIT + 1)], "big.docx");
  await assert.rejects(openOfficeMode(big), (error) => {
    assert.deepEqual(fileErrorReason(error), {
      kind: "too-large",
      limitMb: 30,
    });
    return true;
  });
});
