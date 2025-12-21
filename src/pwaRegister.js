import { registerSW } from "virtual:pwa-register";

export function registerPWA() {
  if (!("serviceWorker" in navigator)) return;
  registerSW({ immediate: true });
}
