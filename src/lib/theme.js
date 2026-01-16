// src/lib/theme.js
const KEY = "tmd_theme"; // "light" | "dark" | "system"

const isValidPref = (v) => v === "light" || v === "dark" || v === "system";

export function getThemePreference() {
  try {
    const stored = localStorage.getItem(KEY);
    return isValidPref(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref) {
  const p = isValidPref(pref) ? pref : "system";

  if (p === "light") return "light";
  if (p === "dark") return "dark";

  // system
  try {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Back-compat: getTheme() returns the RESOLVED theme ("light" | "dark")
export function getTheme() {
  return resolveTheme(getThemePreference());
}

// applyTheme accepts "light" | "dark" | "system" and applies RESOLVED theme to DOM
export function applyTheme(pref) {
  const p = isValidPref(pref) ? pref : "system";
  const resolved = resolveTheme(p);

  try {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
    localStorage.setItem(KEY, p);
  } catch {
    // ignore
  }

  return resolved;
}

/**
 * If user preference is "system", keep the theme synced to OS changes.
 * Returns an unsubscribe function.
 */
export function startThemeSync() {
  try {
    if (!window.matchMedia) return () => {};
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = () => {
      const pref = getThemePreference();
      if (pref === "system") applyTheme("system");
    };

    // Initial sync
    handler();

    // Subscribe
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    // Safari fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  } catch {
    return () => {};
  }
}


