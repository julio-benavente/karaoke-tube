import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Karaoke Tube",
    description: "Karaoke parties with friends on YouTube",
    // chrome.storage.session keeps the running party across service worker restarts.
    permissions: ["storage"],
    // Let the background script call our API (local dev + deployed Worker).
    host_permissions: ["http://localhost:8787/*", "https://*.workers.dev/*"],
  },
});
