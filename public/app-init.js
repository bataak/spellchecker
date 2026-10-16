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

function __showBody() {
  document.body && document.body.classList.add("ready");
}
window.addEventListener("DOMContentLoaded", __showBody);
window.addEventListener("load", __showBody);
setTimeout(__showBody, 1500);
// Шинэчлэлийн дараах reload-ыг зөвхөн бүдгэрүүлнэ (appupdate.ts тэмдэглэнэ).
try {
  if (sessionStorage.getItem("mn-spell:update-reload")) {
    sessionStorage.removeItem("mn-spell:update-reload");
    document.documentElement.classList.add("settling");
  }
} catch (e) {}
// main.ts ачаалагдаж чадахгүй бол хуудас бүдгэрсэн хэвээр үлдэхгүй.
setTimeout(function () {
  document.documentElement.classList.remove("settling");
}, 3000);
