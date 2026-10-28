import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { chromium, firefox } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

export interface App {
  readonly url: string;
  readonly browser: Browser;
  readonly files: Fixtures;
  readonly context: (options?: ContextOptions) => Promise<BrowserContext>;
  readonly close: () => Promise<void>;
}

export interface ContextOptions {
  readonly clipboard?: boolean;
}

export interface Fixtures {
  readonly a: string;
  readonly b: string;
  readonly project: string;
  readonly other: string;
  readonly big: string;
  readonly docx: string;
}

const BOOT_TIMEOUT_MS = 90_000;

export const FIREFOX = process.env.E2E_ENGINE === "firefox";
export const CDP_ONLY = FIREFOX && "pinch-ийг зөвхөн Chromium-ийн CDP дуурайна";

async function launch(): Promise<Browser> {
  if (FIREFOX) return firefox.launch();
  const path = process.env.E2E_BROWSER;
  if (path) return chromium.launch({ executablePath: path });
  try {
    return await chromium.launch();
  } catch {
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      return chromium.launch({
        executablePath: "/usr/bin/brave",
      });
    }
  }
}

function fixtures(): Fixtures {
  const dir = mkdtempSync(join(tmpdir(), "hunspell-e2e-"));
  const write = (name: string, data: string | Uint8Array): string => {
    const path = join(dir, name);
    writeFileSync(path, data);
    return path;
  };
  const zip = (files: Record<string, string>): Uint8Array =>
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
      ),
    );
  return {
    a: write("a.txt", "Файл А\n"),
    b: write("b.txt", "Файл Б\n"),
    project: write(
      "tesis.zip",
      zip({
        "tesis/main.tex":
          "\\documentclass{article}\n\\usepackage{mystyle}\n\\begin{document}\nСайн байна уу.\n\\end{document}\n",
        "tesis/mystyle.sty":
          "% mystyle\n\\ProvidesPackage{mystyle}\n\\newcommand{\\hello}{Сайн}\n",
      }),
    ),
    other: write(
      "other.zip",
      zip({
        "other/main.tex":
          "\\documentclass{article}\n\\begin{document}\nӨөр төсөл.\n\\end{document}\n",
      }),
    ),
    big: write(
      "big.zip",
      zip({
        "big/main.tex":
          "\\documentclass{article}\n\\begin{document}\n" +
          Array.from(
            { length: 150 },
            (_, i) =>
              `\\section{Бүлэг ${i}}\n` +
              "Монгол хэлний \\textbf{дүрэм} болон $x^2$ бичгийн соёл хөгжиж байна. ".repeat(
                8,
              ),
          ).join("\n\n") +
          "\n\\end{document}\n",
      }),
    ),
    docx: write(
      "test.docx",
      zip({
        "[Content_Types].xml":
          '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels":
          '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml":
          '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ворд баримт байна.</w:t></w:r></w:p></w:body></w:document>',
      }),
    ),
  };
}

export async function startApp(): Promise<App> {
  const cacheDir = mkdtempSync(join(tmpdir(), "hunspell-vite-"));
  const server: ViteDevServer = await createServer({
    logLevel: "silent",
    cacheDir,
    server: { port: 5300 + Math.floor(Math.random() * 600) },
  });
  await server.listen();
  await server.warmupRequest("/src/main.ts");
  const url = server.resolvedUrls!.local[0]!;
  const browser = await launch();
  const contexts: BrowserContext[] = [];
  return {
    url,
    browser,
    files: fixtures(),
    async context(options = {}) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 950 },
        ...(options.clipboard && !FIREFOX
          ? { permissions: ["clipboard-read", "clipboard-write"] }
          : {}),
      });
      await context.addInitScript(() => {
        const win = window as unknown as Record<string, unknown>;
        delete (Window.prototype as unknown as Record<string, unknown>)
          .showOpenFilePicker;
        delete win.showOpenFilePicker;
      });
      contexts.push(context);
      return context;
    },
    async close() {
      for (const context of contexts) await context.close().catch(() => {});
      await browser.close();
      await server.close();
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}

export async function until<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeout = 10000,
): Promise<T> {
  const end = Date.now() + timeout;
  let value = await read();
  while (!ok(value) && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
}

const pageErrors = new WeakMap<Page, string[]>();

export const errors = (page: Page): string[] => pageErrors.get(page) ?? [];

export async function openPage(
  app: App,
  context: BrowserContext,
): Promise<Page> {
  const page = await context.newPage();
  const seen: string[] = [];
  pageErrors.set(page, seen);
  page.on("pageerror", (error) => seen.push(error.message));
  await page.goto(app.url);
  await ready(page);
  return page;
}

export async function throttle(page: Page, rate: number): Promise<boolean> {
  if (FIREFOX) return false;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return true;
}

export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("booting"),
    undefined,
    { timeout: BOOT_TIMEOUT_MS },
  );
  await page.waitForTimeout(300);
}

export async function reload(page: Page): Promise<void> {
  await page.reload();
  await ready(page);
}

export const editor = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector<HTMLTextAreaElement>("#editor")!.value,
  );

export const status = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector("#statusText")?.textContent ?? "");

export const slotLabel = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector(".md-template")?.textContent?.trim() ?? "",
  );

export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.click("#editor");
  await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#editor")!;
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await page.keyboard.type(text);
}

export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

export async function chooseSlot(page: Page, name: string): Promise<void> {
  await page.click("#editor");
  await page.waitForTimeout(400);
  await page.click(".md-template");
  await page.locator(".md-menu-item", { hasText: name }).first().click();
  await until(
    () => slotLabel(page),
    (label) => label === name || label === "Файл",
  );
  await page.waitForTimeout(500);
}

export async function chooseProject(page: Page): Promise<void> {
  await page.click("#editor");
  await page.waitForTimeout(400);
  await page.click(".md-template");
  await page.click('.md-menu-item[data-value="project"]');
  await page.waitForTimeout(1200);
}

export async function openFile(page: Page, path: string): Promise<void> {
  await page.click("#openBtn");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click(".project-menu-item >> nth=0"),
  ]);
  await chooser.setFiles(path);
  await page.waitForTimeout(1500);
}

export async function projectFile(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".project-panel");
    if (panel?.hidden)
      document.querySelector<HTMLElement>(".project-toggle")?.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate((target) => {
    document
      .querySelector<HTMLElement>(`.project-row[data-path$="${target}"]`)!
      .click();
  }, path);
  await page.waitForTimeout(900);
}

export const projectDirty = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".project-row")]
      .filter((row) => row.querySelector(".project-dot"))
      .map((row) => row.dataset.path ?? ""),
  );

export async function answer(page: Page, label: string): Promise<void> {
  await page
    .locator(".ask-dialog")
    .getByRole("button", { name: label, exact: true })
    .click();
}
