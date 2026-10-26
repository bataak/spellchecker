import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  "<textarea></textarea><button></button><button></button>",
);
const { drop, explainTexError, keepTidied, render, texKey } =
  await import("../src/preview/texjob.ts");
const { tidyTex } = await import("../src/tex/textidy.ts");

test.after(() => dom.close());

const PDF = new Uint8Array([1, 2, 3]);

function ctx(text: string, project: string | null = null) {
  const [area] = document.querySelectorAll("textarea");
  const [compileBtn, downloadBtn] = document.querySelectorAll("button");
  area!.value = text;
  const calls: string[] = [];
  const pooled = new Map<string, unknown>();
  let shown: Uint8Array | null = null;
  const st = {
    auto: true,
    lastCompileMs: 0,
    texMode: true,
    texShown: null as string | null,
    pdfText: null as string | null,
    texTimer: 0,
    texSeq: 0,
    texRestored: false,
    pdfOfProject: false,
    retryTimer: 0,
    retries: 0,
    triedText: null,
    compiling: null,
    savingPdf: 0,
    forced: false,
    offTexImages: null,
    shownMissing: [] as readonly string[],
    scheduled: null,
    tidyMemo: null,
  };
  const c = {
    st,
    setAuto: () => {},
    pool: {
      touch: (key: string) => pooled.get(key),
      put: (key: string, value: unknown) => void pooled.set(key, value),
    },
    deps: {
      area: area!,
      compileBtn: compileBtn!,
      downloadBtn: downloadBtn!,
      projectKey: () => project,
      visible: () => true,
      setError: (message: string | null) => calls.push("error:" + message),
      setMissing: (paths: readonly string[]) =>
        calls.push("missing:" + paths.join(",")),
      onShown: () => calls.push("shown"),
      pane: {
        shown: () => shown,
        view: () => (shown ? {} : null),
        drop: () => {
          shown = null;
          calls.push("drop");
        },
        showBytes: async (bytes: Uint8Array) => {
          shown = bytes;
          return true;
        },
      },
    },
  };
  return { c: c as never as Parameters<typeof render>[0], st, calls, pooled };
}

test("explainTexError: сүлжээний алдааг тайлбарлаж, бусдыг дамжуулна", () => {
  assert.equal(explainTexError(new Error("! Undefined"), true), "! Undefined");
  assert.equal(explainTexError(null, true), "PDF үүсгэж чадсангүй");
  assert.match(explainTexError(new Error("Failed to fetch"), false), /HTTPS/);
  assert.match(explainTexError(new Error("Failed to fetch"), true), /онлайн/);
});

test("texKey: төсөлд байхад төслийн түлхүүрийг ашиглана", () => {
  assert.equal(texKey(ctx("\\a").c), "\\a");
  assert.equal(texKey(ctx("\\a", "p1").c), "\u0000project:p1");
});

test("render: pool-д байгаа PDF-ийг шууд харуулна", async () => {
  const { c, st, calls, pooled } = ctx("\\section{A}");
  pooled.set("\\section{A}", {
    text: "\\section{A}",
    pdf: PDF,
    missing: ["x.png"],
  });
  await render(c);
  assert.equal(st.texShown, "\\section{A}");
  assert.equal(st.pdfText, "\\section{A}");
  assert.deepEqual(calls, ["shown", "error:null", "missing:x.png"]);
  calls.length = 0;
  await render(c);
  assert.equal(calls.length, 0);
  drop(c);
  assert.equal(st.texShown, null);
  assert.ok(calls.includes("drop"));
});

test("keepTidied: зөвхөн tidy хийсэн өөрчлөлтөд PDF-ийг хэвээр үлдээнэ", async () => {
  const raw = "\\begin{itemize}\n\\item a\n\\end{itemize}";
  const tidy = tidyTex(raw);
  const { c, st, pooled } = ctx(raw);
  pooled.set(raw, { text: raw, pdf: PDF, missing: [] });
  await render(c);
  assert.equal(keepTidied(c), false);
  assert.notEqual(tidy, raw);
  (c as never as { deps: { area: HTMLTextAreaElement } }).deps.area.value =
    tidy;
  assert.equal(keepTidied(c), true);
  assert.equal(st.texShown, tidy);
  assert.ok(pooled.has(tidy));
});
