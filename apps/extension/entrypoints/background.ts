import { fetchHealth, type ExtMessage } from "@/utils/api";

export default defineBackground(() => {
  console.log("[bg] background service worker started", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((msg: ExtMessage, sender, sendResponse) => {
    console.log("[bg] message", msg, "from", sender.tab?.url ?? "popup");

    if (msg.type === "PING_API") {
      fetchHealth()
        .then((health) => {
          console.log("[bg] API health:", health);
          sendResponse({ ok: true, health });
        })
        .catch((e) => {
          console.error("[bg] API call failed:", e);
          sendResponse({ ok: false, error: String(e) });
        });
      return true; // keep the channel open for the async response
    }

    if (msg.type === "VIDEO_CHANGED") {
      console.log("[bg] YouTube video is now:", msg.videoId);
    }
  });
});
