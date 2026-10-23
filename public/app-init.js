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

(function () {
  var KEY = "mn-spell:boot-rescue";
  var sw = navigator.serviceWorker;
  function stuck() {
    return document.documentElement.classList.contains("booting");
  }
  function rescue() {
    if (!sw || !sw.controller || !stuck()) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch (e) {
      return;
    }
    var regs = sw.getRegistrations().then(function (list) {
      return Promise.all(
        list.map(function (reg) {
          return reg.unregister();
        }),
      );
    });
    var caches_ = self.caches
      ? caches.keys().then(function (names) {
          return Promise.all(
            names
              .filter(function (name) {
                return name.indexOf("workbox-precache") === 0;
              })
              .map(function (name) {
                return caches.delete(name);
              }),
          );
        })
      : null;
    Promise.all([regs, caches_]).then(
      function () {
        location.reload();
      },
      function () {
        location.reload();
      },
    );
  }
  window.addEventListener(
    "error",
    function (event) {
      var el = event.target;
      if (el && (el.type === "module" || el.rel === "modulepreload"))
        rescue();
    },
    true,
  );
  setTimeout(rescue, 15000);
})();
