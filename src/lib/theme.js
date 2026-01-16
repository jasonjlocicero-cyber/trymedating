// src/lib/theme.js
const KEY = "tmd_theme";

export function getTheme() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;

    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    return prefersDark ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  try {
    document.documentElement.dataset.theme = t;
    // Helps browsers render form controls correctly
    document.documentElement.style.colorScheme = t;
    localStorage.setItem(KEY, t);
  } catch {
    // ignore
  }
  return t;
}
