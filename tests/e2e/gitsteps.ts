import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { openFile } from "./harness.ts";

export const MAIN =
  "\\documentclass{article}\n\\begin{document}\n\\input{ch}\n\\end{document}\n";

export const rows = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".project-row")].map(
      (row) => row.dataset.path ?? "",
    ),
  );

export const openPanel = async (page: Page): Promise<void> => {
  const local = join(mkdtempSync(join(tmpdir(), "git-e2e-")), "local.tex");
  writeFileSync(local, MAIN);
  await openFile(page, local);
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".project-panel");
    if (!panel || panel.hidden)
      document.querySelector<HTMLElement>(".project-toggle")?.click();
  });
  await page.locator(".project-open", { hasText: "Git repo нээх" }).click();
};

export const openMore = async (page: Page): Promise<void> => {
  if ((await page.getAttribute(".git-more", "open")) === null)
    await page.click(".git-more > summary");
};

export const commit = async (page: Page, message?: string): Promise<void> => {
  await page.keyboard.press("Control+s");
  const area = page.locator(".git-panel textarea");
  await area.waitFor({ timeout: 10000 });
  if (message !== undefined) await area.fill(message);
  await page.click(".git-panel .export-confirm");
};
