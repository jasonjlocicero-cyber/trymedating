// src/lib/theme.js
const KEY = "tmd_theme"; // "light" | "dark" | "system"

export function getThemeMode() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(mode) {
  const m = mode === "light" || mode === "dark" || mode === "system" ? mode : "system";

  if (m === "light") return "light";
  if (m === "dark") return "dark";

  // system
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

// Back-compat: getTheme() returns the *resolved* theme ("light" or "dark")
export function getTheme() {
  return resolveTheme(getThemeMode());
}

/**
 * Apply theme:
 * - Accepts "light" | "dark" | "system"
 * - Stores the MODE in localStorage
 * - Sets data-theme to the RESOLVED value ("light" | "dark")
 */
export function applyTheme(modeOrTheme) {
  const mode =
    modeOrTheme === "light" || modeOrTheme === "dark" || modeOrTheme === "system"
      ? modeOrTheme
      : "system";

  const resolved = resolveTheme(mode);

  try {
    document.documentElement.setAttribute("data-theme", resolved);
    // Helps browser form controls match theme
    document.documentElement.style.colorScheme = resolved;

    // Store the mode (not the resolved), so "system" stays "system"
    localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }

  return resolved;
}

/**
 * Optional: when in "system" mode, update theme live if OS theme changes.
 * Returns a cleanup function.
 */
export function watchSystemTheme(onChange) {
  try {
    if (!window.matchMedia) return () => {};
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = () => {
      if (typeof onChange === "function") onChange();
    };

    // Safari compatibility
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else if (mq.removeListener) mq.removeListener(handler);
    };
  } catch {
    return () => {};
  }
}



