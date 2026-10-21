import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<div id="host"></div>');
const g = globalThis as unknown as Record<string, unknown>;

const observers: FakeObserver[] = [];
class FakeObserver {
  readonly targets: Element[] = [];
  disconnected = false;
  readonly callback: (entries: unknown[]) => void;
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
    observers.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  show(target: Element, isIntersecting: boolean): void {
    this.callback([{ target, isIntersecting }]);
  }
}
g.IntersectionObserver = FakeObserver;
g.ResizeObserver = FakeObserver;
(dom.window.HTMLCanvasElement.prototype as { getContext: unknown }).getContext =
  () => ({});

const { renderPdfInto } = await import("../src/preview/pdfview.ts");
type Task = import("../src/preview/pdfview.ts").PdfLoadingTask;

test.after(() => dom.close());

interface Fake {
  readonly renders: number[];
  destroyed: number;
}

function fakeTask(pages: string[][], fake: Fake): Task {
  const page = (index: number) => ({
    view: [0, 0, 600, 800],
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: () => {
      fake.renders.push(index);
      return { promise: Promise.resolve(), cancel: () => {} };
    },
    cleanup: () => {},
    getTextContent: async () => ({
      items: pages[index - 1]!.map((str, i) => ({
        str,
        hasEOL: true,
        width: str.length * 6,
        transform: [10, 0, 0, 10, 72, 700 - i * 20],
      })),
    }),
  });
  return {
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (index: number) => page(index),
    }),
    destroy: async () => {
      fake.destroyed += 1;
    },
  } as unknown as Task;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const file = () => new File([new Uint8Array([37, 80, 68, 70])], "a.pdf");

function host(): HTMLElement {
  document.body.innerHTML = '<div id="host"></div>';
  observers.length = 0;
  return document.querySelector<HTMLElement>("#host")!;
}

test("pdfView: хуудас бүрд хүрээ үүсгэж, эхний хуудасны харьцааг авна", async () => {
  const fake: Fake = { renders: [], destroyed: 0 };
  const pages: number[][] = [];
  const view = await renderPdfInto(host(), file(), undefined, 1.5, {
    load: () => fakeTask([["а"], ["б"], ["в"]], fake),
    onPage: (page, total) => pages.push([page, total]),
  });
  const frames = document.querySelectorAll<HTMLElement>(".pdf-page");
  assert.equal(view.pages, 3);
  assert.equal(frames.length, 3);
  assert.equal(frames[0]!.style.aspectRatio, "600 / 800");
  assert.equal(
    document
      .querySelector<HTMLElement>(".pdf-pages")!
      .style.getPropertyValue("--pdf-zoom"),
    "1.5",
  );
  await new Promise((resolve) => requestAnimationFrame(resolve));
  assert.deepEqual(pages.at(-1), [1, 3]);
  view.destroy();
});

test("pdfView: харагдсан хуудсыг зурж, нуугдвал суллана", async () => {
  const fake: Fake = { renders: [], destroyed: 0 };
  const view = await renderPdfInto(host(), file(), undefined, 1, {
    load: () => fakeTask([["а"], ["б"]], fake),
  });
  const io = observers.find((o) => o.targets.length === 2)!;
  const [first, second] = io.targets as HTMLElement[];
  io.show(second!, true);
  await flush();
  assert.deepEqual(fake.renders, [2]);
  assert.ok(second!.querySelector("canvas"));
  assert.equal(first!.querySelector("canvas"), null);
  io.show(second!, false);
  assert.equal(second!.querySelector("canvas"), null);
  view.destroy();
  assert.ok(io.disconnected);
  assert.equal(document.querySelector(".pdf-pages"), null);
  assert.equal(fake.destroyed, 1);
});

test("pdfView: abort хийхэд цэвэрлэгдэнэ, эхлэхээс өмнө abort бол алдаа", async () => {
  const fake: Fake = { renders: [], destroyed: 0 };
  const controller = new AbortController();
  await renderPdfInto(host(), file(), controller.signal, 1, {
    load: () => fakeTask([["а"]], fake),
  });
  controller.abort();
  assert.equal(document.querySelector(".pdf-pages"), null);
  assert.equal(fake.destroyed, 1);

  const early = new AbortController();
  early.abort();
  await assert.rejects(
    renderPdfInto(host(), file(), early.signal, 1, {
      load: () => fakeTask([["а"]], fake),
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(fake.destroyed, 2);
});

test("pdfView: цэгийг хуудасны харьцангуй координат болгоно", async () => {
  const fake: Fake = { renders: [], destroyed: 0 };
  const view = await renderPdfInto(host(), file(), undefined, 1, {
    load: () => fakeTask([["а"], ["б"]], fake),
  });
  const frames = [...document.querySelectorAll<HTMLElement>(".pdf-page")];
  frames.forEach((frame, i) => {
    frame.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 400,
        top: i * 500,
        bottom: i * 500 + 400,
        width: 300,
        height: 400,
      }) as DOMRect;
  });
  assert.deepEqual(view.pointAt(250, 600), { page: 2, x: 0.5, y: 0.25 });
  assert.equal(view.pointAt(50, 600), null);
  assert.equal(view.pointAt(250, 450), null);
  view.destroy();
});

test("pdfView: хуудаснуудын текстийг үг болгон уншина", async () => {
  const fake: Fake = { renders: [], destroyed: 0 };
  const view = await renderPdfInto(host(), file(), undefined, 1, {
    load: () => fakeTask([["Сайн байна"], ["Монгол"]], fake),
  });
  const words = await view.words();
  assert.ok(words.length >= 3);
  assert.deepEqual([...new Set(words.map((word) => word.page))], [1, 2]);
  assert.strictEqual(await view.words(), words);
  view.destroy();
});
