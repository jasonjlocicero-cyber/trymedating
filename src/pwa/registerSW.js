// src/pwa/registerSW.js
export function registerTmdSW() {
  try {
    // This virtual module is provided by vite-plugin-pwa during builds
    import("virtual:pwa-register")
      .then((mod) => {
        const registerSW = mod?.registerSW;
        if (typeof registerSW !== "function") return;

        registerSW({
          immediate: true,
          onRegistered() {},
          onRegisterError(err) {
            console.warn("[PWA] SW register error:", err);
          },
        });
      })
      .catch((err) => {
        console.warn("[PWA] SW register import failed:", err);
      });
  } catch (err) {
    console.warn("[PWA] SW setup skipped:", err);
  }
}
