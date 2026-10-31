import type { ExtMessage } from "@/utils/api";

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  main() {
    console.log("[content] Karaoke Tube loaded on", location.href);

    const currentVideoId = () => new URL(location.href).searchParams.get("v");

    const report = () => {
      const videoId = currentVideoId();
      console.log("[content] current video:", videoId);
      browser.runtime.sendMessage({ type: "VIDEO_CHANGED", videoId } satisfies ExtMessage);

      const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
      if (video) {
        video.onended = () => console.log("[content] video ended:", videoId);
      }
    };

    // YouTube is a single-page app: this event fires on every in-app navigation.
    document.addEventListener("yt-navigate-finish", report);
    report();

    // Prove the content script -> background -> API round trip works.
    browser.runtime
      .sendMessage({ type: "PING_API" } satisfies ExtMessage)
      .then((res) => console.log("[content] API via background:", res));
  },
});
