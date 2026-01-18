(function () {
  try {
    var t = localStorage.getItem("tmd_theme");
    if (t !== "light" && t !== "dark") {
      var prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      t = prefersDark ? "dark" : "light";
    }
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  } catch (e) {}
})();
