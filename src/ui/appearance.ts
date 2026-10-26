import { KEYS, read, write } from "../core/store.ts";

export interface AppearanceButtons {
  readonly theme: HTMLElement;
  readonly fontInc: HTMLElement;
  readonly fontDec: HTMLElement;
  readonly fontReset: HTMLElement;
}

export function initAppearance(buttons: AppearanceButtons): void {
  const rootEl = document.documentElement;

  function applyTheme(theme: string): void {
    rootEl.setAttribute("data-theme", theme);
  }
  (function initTheme() {
    let theme = read(KEYS.theme);
    if (!theme) {
      theme =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }
    applyTheme(theme);
  })();

  buttons.theme.addEventListener("click", () => {
    const next =
      rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    write(KEYS.theme, next);
  });

  const FONT_MIN = 0.8;
  const FONT_MAX = 1.8;
  const FONT_STEP = 0.1;
  let fontScale = 1;
  const savedFontScale = parseFloat(read(KEYS.fontScale) ?? "");
  if (!isNaN(savedFontScale)) fontScale = savedFontScale;
  function applyScale(): void {
    fontScale =
      Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, fontScale)) * 100) / 100;
    rootEl.style.setProperty("--editor-scale", String(fontScale));
    write(KEYS.fontScale, String(fontScale));
  }
  applyScale();
  buttons.fontInc.addEventListener("click", () => {
    fontScale += FONT_STEP;
    applyScale();
  });
  buttons.fontDec.addEventListener("click", () => {
    fontScale -= FONT_STEP;
    applyScale();
  });
  buttons.fontReset.addEventListener("click", () => {
    fontScale = 1;
    applyScale();
  });
}
