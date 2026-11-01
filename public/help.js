(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  function toggleTheme() {
    var current =
      root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-style]").forEach(function (element) {
      element.style.cssText = element.getAttribute("data-style");
    });
    document.getElementById("theme").addEventListener("click", toggleTheme);
  });
})();
