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

function __showBody() {
  document.body && document.body.classList.add("ready");
}
window.addEventListener("DOMContentLoaded", __showBody);
window.addEventListener("load", __showBody);
setTimeout(__showBody, 1500);
