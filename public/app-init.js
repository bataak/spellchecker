(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (!theme)
      theme = matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();

(function () {
  var ios =
    /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta)
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
    );
})();

(function () {
  try {
    var style = document.documentElement.style;
    var scale = parseFloat(localStorage.getItem("mn-spell:scale") || "");
    if (scale >= 0.8 && scale <= 1.8)
      style.setProperty("--editor-scale", String(scale));
    var metrics = JSON.parse(localStorage.getItem("mn-spell:metrics") || "{}");
    if (metrics.per > 0) style.setProperty("--editor-per", metrics.per + "px");
    if (metrics.monoFit > 0)
      style.setProperty("--mono-fit", String(metrics.monoFit));
  } catch (e) {}
})();

try {
  if (sessionStorage.getItem("mn-spell:has-text") === "1")
    document.documentElement.classList.add("has-text");
} catch (e) {}

function __showBody() {
  document.body && document.body.classList.add("ready");
}
window.addEventListener("DOMContentLoaded", __showBody);
window.addEventListener("load", __showBody);
setTimeout(__showBody, 1500);
