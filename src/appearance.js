export function initAppearance() {
  const rootEl = document.documentElement;

  function applyTheme(theme) {
    rootEl.setAttribute("data-theme", theme);
    const btn = document.querySelector("#themeBtn");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  (function initTheme() {
    let theme = null;
    try {
      theme = localStorage.getItem("theme");
    } catch (_) {}
    if (!theme) {
      theme =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }
    applyTheme(theme);
  })();

  document.querySelector("#themeBtn").addEventListener("click", () => {
    const next =
      rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch (_) {}
  });

  const FONT_KEY = "mn-spell:scale";
  const FONT_MIN = 0.8;
  const FONT_MAX = 1.8;
  const FONT_STEP = 0.1;
  let fontScale = 1;
  try {
    const s = parseFloat(localStorage.getItem(FONT_KEY));
    if (!isNaN(s)) fontScale = s;
  } catch (_) {}
  function applyScale() {
    fontScale =
      Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, fontScale)) * 100) / 100;
    rootEl.style.setProperty("--editor-scale", String(fontScale));
    try {
      localStorage.setItem(FONT_KEY, String(fontScale));
    } catch (_) {}
  }
  applyScale();
  document.querySelector("#fontIncBtn").addEventListener("click", () => {
    fontScale += FONT_STEP;
    applyScale();
  });
  document.querySelector("#fontDecBtn").addEventListener("click", () => {
    fontScale -= FONT_STEP;
    applyScale();
  });
  document.querySelector("#fontResetBtn").addEventListener("click", () => {
    fontScale = 1;
    applyScale();
  });
}
