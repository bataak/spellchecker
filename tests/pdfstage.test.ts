import test from "node:test";
import assert from "node:assert/strict";

import { inStage, PdfStageError } from "../src/office/pdf/pdftext.ts";
import { toSafeError } from "../src/core/safeerror.ts";

test("inStage: үр дүнг дамжуулж, алдааг шатны кодтой боож шалтгааныг хадгална", async () => {
  assert.equal(await inStage("page", async () => 7, 50), 7);
  const cause = new TypeError("boom");
  const failed = inStage("document", () => Promise.reject(cause));
  await assert.rejects(failed, (error) => {
    assert.ok(error instanceof PdfStageError);
    assert.equal(error.code, "PDF_DOCUMENT");
    assert.equal(error.cause, cause);
    assert.equal(toSafeError(error).code, "PDF_DOCUMENT");
    return true;
  });
  const thrown = inStage("worker", () => {
    throw cause;
  });
  await assert.rejects(thrown, (error) => (error as Error).cause === cause);
});

test("inStage: хариу ирэхгүй гацвал хугацаа хэтэрсэн алдаагаар татгалзана", async () => {
  const started = performance.now();
  const stalled = inStage("text", () => new Promise<never>(() => {}), 30);
  await assert.rejects(stalled, (error) => {
    assert.ok(error instanceof PdfStageError);
    assert.equal(error.code, "PDF_TEXT");
    assert.equal((error.cause as Error).name, "TimeoutError");
    return true;
  });
  assert.ok(performance.now() - started < 2000);
});
