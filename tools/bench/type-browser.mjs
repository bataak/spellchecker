import { chromium, firefox } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENGINES = { chromium, firefox };
const CHAR_DELAY_MS = 200;
const APP_URL = "https://aldaa.bichig.dev/";
const BLANK_URL =
  'data:text/html,<textarea style="width:90vw;height:80vh"></textarea>';

const [engine, seconds, textFile, target = "app"] = process.argv.slice(2);
const blank = target === "blank";

function launchOptions() {
  if (engine !== "firefox" || process.platform !== "darwin") return {};
  // macOS denies Playwright's Firefox the user's ~/Library Firefox folders.
  const home = fileURLToPath(new URL("out/firefox-home", import.meta.url));
  mkdirSync(`${home}/Library/Caches`, { recursive: true });
  mkdirSync(`${home}/Library/Application Support`, { recursive: true });
  return { env: { ...process.env, HOME: home, CFFIXED_USER_HOME: home } };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function typeFor(page, text, ms) {
  const end = Date.now() + ms;
  let typed = 0;
  while (Date.now() < end) {
    const char = text[typed % text.length];
    if (char === "\n") await page.keyboard.press("Enter");
    else await page.keyboard.insertText(char);
    typed += 1;
    await wait(CHAR_DELAY_MS);
  }
  return typed;
}

const browser = await ENGINES[engine].launch({
  headless: false,
  ...launchOptions(),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(blank ? BLANK_URL : APP_URL, { waitUntil: "networkidle" });
await page.click(blank ? "textarea" : "#editor");
await page.keyboard.press("ControlOrMeta+A");
await page.keyboard.press("Delete");
const text = readFileSync(textFile, "utf8");
const typed = await typeFor(page, text, Number(seconds) * 1000);
console.log(JSON.stringify({ typed }));
await browser.close();
