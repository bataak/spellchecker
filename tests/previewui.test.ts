import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");

const { buildPreviewHead, HEAD_TEXT } =
  await import("../src/preview/previewhead.ts");
const { initImageEdit } = await import("../src/preview/imageedit.ts");
const { resolveImages, handleImageClick } =
  await import("../src/preview/mdimages.ts");
const { onImagesChange } = await import("../src/files/images.ts");
const { isOfflineReady, offlineCapable, runOfflineIndicator } =
  await import("../src/core/offline.ts");

test.after(() => dom.close());

const key = (target: Element, name: string): void => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true }),
  );
};

function head() {
  resetStorage();
  const panel = document.createElement("section");
  const calls: string[] = [];
  let navigable = true;
  const ui = buildPreviewHead(panel, {
    onZoom: (action) => calls.push("zoom:" + action),
    onGoTo: (page) => calls.push("go:" + page),
    canNavigate: () => navigable,
  });
  const button = (label: string): HTMLButtonElement =>
    ui.head.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  return { panel, ui, calls, button, block: () => (navigable = false) };
}

test("previewhead: гарчиг, товчнууд, томруулах хязгаарыг харуулна", () => {
  const { ui, calls, button } = head();
  assert.equal(ui.title.textContent, HEAD_TEXT);
  assert.equal(ui.downloadBtn.disabled, true);
  button("Томруулах").click();
  button("Жижгэрүүлэх").click();
  button("Анхны хэмжээ").click();
  assert.deepEqual(calls, ["zoom:in", "zoom:out", "zoom:reset"]);
  ui.showZoom(0.25);
  assert.equal(button("Анхны хэмжээ").textContent, "25%");
  assert.equal(button("Жижгэрүүлэх").disabled, true);
  ui.showZoom(8);
  assert.equal(button("Томруулах").disabled, true);
});

test("previewhead: хуудсыг цагаанаар харах сонголтыг хадгална", () => {
  const { panel, button } = head();
  const invert = button("Хуудсыг цагаанаар харах");
  assert.equal(panel.classList.contains("no-invert"), false);
  invert.click();
  assert.equal(panel.classList.contains("no-invert"), true);
  assert.equal(invert.getAttribute("aria-pressed"), "true");
  assert.equal(localStorage.getItem("pdfInvert"), "off");
});

test("previewhead: хуудасны дугаар оруулж очно, Escape-ээр болино", () => {
  const { ui, calls, block } = head();
  const label = ui.head.querySelector<HTMLButtonElement>(".pdf-page-label")!;
  const input = ui.head.querySelector<HTMLInputElement>(".pdf-page-input")!;
  ui.showPage(3, 12);
  assert.equal(label.textContent, "3 / 12");
  label.click();
  assert.equal(input.hidden, false);
  assert.equal(input.value, "3");
  input.value = " 7 ";
  key(input, "Enter");
  assert.equal(input.hidden, true);
  label.click();
  input.value = "9";
  key(input, "Escape");
  label.click();
  input.value = "abc";
  key(input, "Enter");
  label.click();
  ui.closePageInput();
  assert.equal(label.hidden, false);
  block();
  label.click();
  assert.equal(input.hidden, true);
  assert.deepEqual(calls, ["go:7"]);
});

function imageSetup(text: string) {
  const body = document.createElement("div");
  body.innerHTML =
    '<p class="md-figure"><img class="md-image" src="a.png"></p>' +
    '<p><button class="md-image-missing"></button></p>';
  document.body.append(body);
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  const img = body.querySelector<HTMLImageElement>("img")!;
  Object.defineProperty(img, "complete", { value: true });
  img.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
  Object.defineProperty(img.parentElement!, "clientWidth", { value: 400 });
  const edit = initImageEdit(body, area);
  edit.refresh();
  const frame = body.querySelector<HTMLElement>(".image-frame")!;
  return { body, area, img, edit, frame };
}

test("imageedit: зургийг сонгож, эргүүлж, Escape-ээр болиулна", () => {
  const { area, img, edit, frame } = imageSetup("![a](a.png)\n\n![b](b.png)");
  assert.equal(frame.hidden, true);
  img.click();
  assert.equal(frame.hidden, false);
  assert.equal(frame.style.width, "200px");
  frame.querySelector<HTMLButtonElement>(".image-rotate")!.click();
  assert.match(area.value, /^!\[a\]\(a\.png\)\{rotate=90\}/);
  key(document.body, "Escape");
  assert.equal(frame.hidden, true);
  edit.destroy();
  assert.equal(frame.isConnected, false);
});

test("imageedit: булангаас чирж өргөнийг хувиар хадгална", () => {
  const { area, img, edit, frame } = imageSetup("![a](a.png)");
  img.click();
  const handle = frame.querySelector<HTMLElement>('[data-corner="se"]')!;
  handle.setPointerCapture = () => {};
  const at = (type: string, x: number): PointerEvent =>
    new PointerEvent(type, { clientX: x, pointerId: 1, bubbles: true });
  handle.dispatchEvent(at("pointerdown", 100));
  handle.dispatchEvent(at("pointermove", 140));
  assert.equal(img.style.width, "60%");
  window.dispatchEvent(new Event("resize"));
  handle.dispatchEvent(at("pointerup", 140));
  assert.equal(area.value, "![a](a.png){width=60%}");
  edit.destroy();
});

test("mdimages: алга зураг, гаднын зургийг товч болгож, зөвшөөрөхөд мэдэгдэнэ", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<img class="md-image" data-src="missing%20one.png" style="width: 50%">' +
    '<img class="md-image" data-src="https://example.com/x.png">' +
    '<img class="md-image" data-src="%E0%A4%A.png">';
  resolveImages(root);
  const missing = root.querySelectorAll<HTMLElement>(".md-image-missing");
  assert.equal(missing[0]!.textContent, "missing one.png");
  assert.equal(missing[0]!.style.width, "50%");
  assert.equal(missing[1]!.textContent, "%E0%A4%A.png");
  const remote = root.querySelector<HTMLElement>(".md-image-remote")!;
  assert.equal(remote.title, "example.com");
  let changed = 0;
  const off = onImagesChange(() => changed++);
  handleImageClick(root, remote);
  handleImageClick(root, root);
  off();
  assert.equal(changed, 1);
  resolveImages(root);
  root.innerHTML =
    '<img class="md-image" data-src="https://example.com/x.png">';
  resolveImages(root);
  assert.equal(
    root.querySelector("img")!.getAttribute("src"),
    "https://example.com/x.png",
  );
});

function cachesWith(entries: Record<string, unknown>) {
  return {
    match: async (url: string) => {
      const hit = entries[new URL(url).pathname];
      if (hit === undefined) return undefined;
      return new Response(JSON.stringify(hit));
    },
  };
}

test("offline: service worker, shell, толь бүгд кэштэй үед л бэлэн гэнэ", async () => {
  const g = globalThis as Record<string, unknown>;
  const savedCaches = g.caches;
  g.location = dom.window.location;
  const worker = { getRegistration: async () => ({ active: {} }) };
  Object.defineProperty(navigator, "serviceWorker", {
    value: worker,
    configurable: true,
  });
  try {
    g.caches = cachesWith({});
    assert.equal(await isOfflineReady(), false);
    g.caches = cachesWith({
      "/": 1,
      "/dict/dict-manifest.json": { dicts: [] },
    });
    assert.equal(await isOfflineReady(), false);
    g.caches = cachesWith({
      "/index.html": 1,
      "/dict/dict-manifest.json": { dicts: [{ id: "mn_MN", dic: "mn.dic" }] },
      "/dict/mn.dic": 1,
    });
    assert.equal(await isOfflineReady(), true);
    worker.getRegistration = async () => ({ active: null }) as never;
    assert.equal(await isOfflineReady(), false);
  } finally {
    g.caches = savedCaches;
    delete g.location;
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

test("offline: боломжгүй орчинд шууд үндсэн төлөвийг харуулна", async () => {
  assert.equal(offlineCapable(), false);
  const shown: string[] = [];
  await runOfflineIndicator({
    idle: () => true,
    setStatus: (html) => shown.push(html),
    base: () => "Бэлэн",
    setActive: () => shown.push("active"),
  });
  assert.deepEqual(shown, ["Бэлэн"]);
});
