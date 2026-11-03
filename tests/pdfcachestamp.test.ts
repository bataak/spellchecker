import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom();
const { chooseImageFolder, imageStamp } =
  await import("../src/tex/teximages.ts");
const { cachedPdf, createPdfPool, pdfIdOf } =
  await import("../src/tex/pdfcache.ts");

test.after(() => dom.close());

const store = new Map<string, Response>();
const cache = {
  match: async (url: string) => store.get(url)?.clone(),
  put: async (url: string, response: Response) => {
    store.set(url, response);
  },
  keys: async () => [...store.keys()].map((url) => ({ url })),
  delete: async (url: string) => store.delete(url),
};
(globalThis as { caches?: unknown }).caches = { open: async () => cache };

const PDF = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>;
const TEX = "\\includegraphics{зураг.png}";
const kept = { text: TEX, pdf: PDF, missing: [] };

async function pickFolder(file: File): Promise<void> {
  const create = document.createElement.bind(document);
  let input: HTMLInputElement | null = null;
  document.createElement = ((name: string) => {
    const element = create(name);
    if (name === "input") input = element as HTMLInputElement;
    return element;
  }) as typeof document.createElement;
  await chooseImageFolder();
  document.createElement = create;
  Object.defineProperty(file, "webkitRelativePath", {
    value: "хавтас/" + file.name,
  });
  Object.defineProperty(input!, "files", { value: [file] });
  input!.dispatchEvent(new Event("change"));
}

const image = (changed: number, content = "a"): File =>
  new File([content], "зураг.png", {
    type: "image/png",
    lastModified: changed,
  });

async function saved(id: Parameters<typeof cachedPdf>[0]): Promise<void> {
  createPdfPool().keep("k", kept, id, null);
  for (let i = 0; i < 20 && !store.size; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 1));
}

test("imageStamp: зураггүй бол хоосон, олдоогүй бол null", async () => {
  assert.equal(await imageStamp("бичвэр"), "");
  assert.equal(await imageStamp("\\includegraphics{алга.png}"), null);
});

test("imageStamp: файл солигдоход өөрчлөгдөнө, verbatim-ыг тоолохгүй", async () => {
  await pickFolder(image(1000));
  const first = await imageStamp(TEX);
  assert.ok(first?.includes("зураг.png"), String(first));
  assert.equal(await imageStamp(TEX), first);
  await pickFolder(image(2000));
  assert.notEqual(await imageStamp(TEX), first);
  await pickFolder(image(2000, "урт агуулга"));
  const longer = await imageStamp(TEX);
  await pickFolder(image(2000, "өөр"));
  assert.notEqual(await imageStamp(TEX), longer);
  assert.equal(
    await imageStamp("\\begin{verbatim}\n" + TEX + "\n\\end{verbatim}\n"),
    "",
  );
});

test("cachedPdf: өөр зурагтай PDF-ийг буцаахгүй, баталж болохгүй бол буцаана", async () => {
  store.clear();
  await saved({ digest: "d", stamp: "хуучин" });
  assert.deepEqual(
    await cachedPdf({ digest: "d", stamp: "хуучин" }),
    new Uint8Array(PDF),
  );
  assert.equal(await cachedPdf({ digest: "d", stamp: "шинэ" }), null);
  assert.ok(await cachedPdf({ digest: "d", stamp: null }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    await cachedPdf({ digest: "d", stamp: "шинэ" }),
    null,
    "дахин хадгалахад тэмдэг алдагдахгүй",
  );
});

test("cachedPdf: тэмдэггүй хуучин кэш уншигдсаар байна", async () => {
  store.clear();
  await saved({ digest: "e", stamp: null });
  assert.ok(await cachedPdf({ digest: "e", stamp: "ямар ч" }));
});

test("pdfIdOf: төсөлд тэмдэг хэрэглэхгүй, бичвэрт хэрэглэнэ", async () => {
  await pickFolder(image(3000));
  const text = await pdfIdOf(TEX, null);
  assert.ok(text?.stamp?.includes("зураг.png"), JSON.stringify(text));
  const digest = () => Promise.resolve("төсөл");
  const project = await pdfIdOf(TEX, {
    build: () => Promise.reject(new Error("no")),
    digest,
  });
  assert.deepEqual(project, { digest: "төсөл", stamp: null });
  const none = await pdfIdOf(TEX, {
    build: () => Promise.reject(new Error("no")),
    digest: () => Promise.resolve(null),
  });
  assert.equal(none, null);
});
