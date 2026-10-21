import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, strToU8 } from "fflate";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<div id="body"></div>');
Object.defineProperty(document, "compatMode", { value: "CSS1Compat" });

const { editName } = await import("../src/project/nameeditor.ts");
const { createFileView } = await import("../src/preview/previewfile.ts");
const { createMarkdownView } = await import("../src/preview/previewmd.ts");
const { renderMath } = await import("../src/preview/mathview.ts");
const { fetchGzBytes, loadDictBytes, plausibleDict } =
  await import("../src/dict/dictrefresh.ts");

test.after(() => dom.close());

function nameEditor(initial: string) {
  const calls: string[] = [];
  const input = editName(
    {
      run: async (task) => {
        calls.push("run");
        await task();
      },
      notify: (message) => calls.push("notify:" + message.slice(0, 3)),
      done: () => calls.push("done"),
    },
    (el) => document.body.append(el),
    initial,
    async (name) => {
      calls.push("commit:" + name);
    },
  );
  return { input, calls };
}

const key = (input: HTMLInputElement, name: string): void => {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name }));
};

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test("nameeditor: өргөтгөлгүй хэсгийг сонгож, Enter-ээр шинэ нэрийг хадгална", async () => {
  const { input, calls } = nameEditor("main.tex");
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 4);
  input.value = " thesis.tex ";
  key(input, "Enter");
  input.dispatchEvent(new Event("blur"));
  await settle();
  assert.deepEqual(calls, ["run", "commit:thesis.tex", "done"]);
  input.remove();
});

test("nameeditor: хориотой тэмдэгт, Escape, өөрчлөлтгүй нэрийг хадгалахгүй", async () => {
  const bad = nameEditor("a.tex");
  bad.input.value = "a/b.tex";
  key(bad.input, "Enter");
  await settle();
  assert.deepEqual(bad.calls, ["notify:Нэр", "done"]);
  const esc = nameEditor("a.tex");
  esc.input.value = "b.tex";
  key(esc.input, "Escape");
  await settle();
  assert.deepEqual(esc.calls, ["done"]);
  const same = nameEditor("a.tex");
  same.input.dispatchEvent(new Event("blur"));
  await settle();
  assert.deepEqual(same.calls, ["done"]);
});

test("previewfile: зургийг харуулж, PDF-ийг pane уруу дамжуулна", () => {
  const body = document.querySelector<HTMLElement>("#body")!;
  const urls: string[] = [];
  const revoked: string[] = [];
  Object.assign(URL, {
    createObjectURL: () => {
      urls.push("blob:" + urls.length);
      return urls.at(-1)!;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  const notes: string[] = [];
  const rendered: string[] = [];
  const view = createFileView(
    body,
    {
      render: async (file: File, onError: () => void) => {
        rendered.push(file.name);
        onError();
      },
    } as never,
    (text) => notes.push(text),
  );
  body.classList.add("is-empty");
  view.show("image", new File(["x"], "a.png"));
  const image = body.querySelector("img")!;
  assert.equal(image.alt, "a.png");
  assert.equal(image.getAttribute("src"), "blob:0");
  assert.equal(body.classList.contains("is-empty"), false);
  image.dispatchEvent(new Event("error"));
  view.show("image", new File(["y"], "b.png"));
  assert.deepEqual(revoked, ["blob:0"]);
  view.show("pdf", new File(["%PDF"], "c.pdf"));
  assert.equal(body.children.length, 0);
  assert.deepEqual(rendered, ["c.pdf"]);
  view.release();
  assert.deepEqual(revoked, ["blob:0", "blob:1"]);
  assert.equal(notes.length, 2);
});

test("previewmd: ижил HTML-ийг дахин зурахгүй, хоосон үед is-empty тавина", () => {
  const body = document.createElement("div");
  const view = createMarkdownView(body);
  let refreshed = 0;
  const blocks = view.render("# Гарчиг\n\nТекст", () => refreshed++);
  assert.equal(blocks.length, 2);
  assert.ok(body.querySelector("h1"));
  assert.equal(view.shown(), true);
  view.render("# Гарчиг\n\nТекст", () => refreshed++);
  assert.equal(refreshed, 1);
  view.clear();
  view.render("# Гарчиг\n\nТекст", () => refreshed++);
  assert.equal(refreshed, 2);
  view.render("   ", () => refreshed++);
  assert.equal(body.classList.contains("is-empty"), true);
  assert.equal(view.shown(), false);
});

test("mathview: томьёог KaTeX-ээр нэг удаа зурж, кэшээс дахин ашиглана", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<span class="math">x^2</span><span class="math math-display">' +
    '\\begin{multline}a\\end{multline}</span><span class="math">x^2</span>';
  renderMath(root);
  const spans = root.querySelectorAll<HTMLElement>(".math");
  assert.equal(spans[0]!.dataset.tex, "x^2");
  assert.ok(spans[0]!.querySelector(".katex"));
  assert.ok(spans[1]!.querySelector(".katex-display"));
  assert.equal(spans[2]!.innerHTML, spans[0]!.innerHTML);
  const before = spans[0]!.innerHTML;
  renderMath(root);
  assert.equal(spans[0]!.innerHTML, before);
});

const respond =
  (bodies: Record<string, Uint8Array | number>): typeof fetch =>
  async (input) => {
    const body = bodies[String(input)];
    if (typeof body === "number") return new Response(null, { status: body });
    return new Response(body ? new Uint8Array(body) : null, {
      status: body ? 200 : 404,
    });
  };

const AFF = strToU8("SET UTF-8\n");
const DIC = strToU8("5000\n" + "үг\n".repeat(30000));

test("dictrefresh: gzip-ийг задлах ба задлахгүй хоёр замаар ижил байт буцаана", async () => {
  const fetcher = respond({ plain: DIC, gz: gzipSync(DIC) });
  assert.deepEqual(await fetchGzBytes("plain", fetcher), DIC);
  assert.deepEqual(await fetchGzBytes("gz", fetcher), DIC);
  const saved = globalThis.DecompressionStream;
  Reflect.deleteProperty(globalThis, "DecompressionStream");
  try {
    assert.deepEqual(await fetchGzBytes("gz", fetcher), DIC);
  } finally {
    globalThis.DecompressionStream = saved;
  }
  await assert.rejects(fetchGzBytes("missing", respond({ missing: 500 })));
});

test("dictrefresh: толийн хэлбэрийг шалгаж, эхний тохирох эх сурвалжийг сонгоно", async () => {
  assert.equal(plausibleDict(AFF, DIC), true);
  assert.equal(plausibleDict(strToU8("SET ISO8859-1"), DIC), false);
  assert.equal(plausibleDict(AFF, strToU8("12\nүг\n")), false);
  assert.equal(plausibleDict(AFF, strToU8("5000\nүг\n")), false);
  const broken = respond({ aff: 503, dic: DIC });
  const tiny = respond({ aff: AFF, dic: strToU8("5000\nүг\n") });
  const good = respond({ aff: AFF, dic: gzipSync(DIC) });
  assert.equal(await loadDictBytes("aff", "dic", [broken, tiny]), null);
  const found = await loadDictBytes("aff", "dic", [broken, tiny, good]);
  assert.deepEqual(found, [AFF, DIC]);
});
