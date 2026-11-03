import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const require = createRequire(import.meta.url);
/** Figtree woff2 files from @fontsource/figtree (a dependency of @karaoke-tube/ui), copied to /fonts. */
const FIGTREE_DIR = resolve(dirname(require.resolve("@fontsource/figtree/package.json", { paths: [resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/ui")] })), "files");

export default defineConfig({
  hooks: {
    "build:publicAssets": (_wxt, assets) => {
      for (const w of [400, 700, 800]) {
        const file = `figtree-latin-${w}-normal.woff2`;
        assets.push({ absoluteSrc: resolve(FIGTREE_DIR, file), relativeDest: `fonts/${file}` });
      }
    },
  },
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Karaoke Tube",
    description: "Karaoke parties with friends on YouTube",
    // chrome.storage.session keeps the running party across service worker restarts.
    permissions: ["storage"],
    // Let the background script call our API (local dev + deployed Worker).
    host_permissions: ["http://localhost:8787/*", "https://*.workers.dev/*"],
    // Figtree for the TV overlay, loaded by the content script at document level.
    web_accessible_resources: [{ resources: ["fonts/*.woff2"], matches: ["*://*.youtube.com/*"] }],
  },
});
