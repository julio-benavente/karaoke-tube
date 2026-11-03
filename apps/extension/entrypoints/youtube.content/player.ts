import type { QueueItem } from "@karaoke-tube/shared";
import type { PlayerPortToBackground } from "@/utils/ports";

type Report = (msg: Extract<PlayerPortToBackground, { type: "event" }>) => void;

/** No sign of the video playing (ads excluded) after this long → `error`. */
const START_TIMEOUT_MS = 15_000;
const PROGRESS_EVERY_MS = 5_000;
const TICK_MS = 500;

const currentVideoId = () => new URL(location.href).searchParams.get("v");
const moviePlayer = () => document.querySelector<HTMLElement>("#movie_player");
const videoEl = () => document.querySelector<HTMLVideoElement>("#movie_player video.html5-main-video");
const adShowing = () => !!moviePlayer()?.classList.contains("ad-showing");

/** YouTube's "video unavailable" / playback error screen inside the player. */
function youtubeError(): boolean {
  const el = document.querySelector<HTMLElement>("#movie_player .ytp-error");
  return !!el && el.offsetParent !== null && getComputedStyle(el).display !== "none";
}

const durationOf = (video: HTMLVideoElement) => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);

/** Plays queue items in this YouTube tab and reports what happens. */
export class YouTubePlayer {
  private item: QueueItem | null = null;
  private started = false;
  private finished = false;
  /** Time spent waiting for the song to start, ads not counted. */
  private waitedMs = 0;
  private lastProgress = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly report: Report) {
    // Media events don't bubble; capture catches `ended` on whichever <video> YouTube uses.
    document.addEventListener("ended", this.onEnded, true);
  }

  dispose() {
    document.removeEventListener("ended", this.onEnded, true);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.item = null;
  }

  play(item: QueueItem) {
    if (this.item?.id === item.id && (this.started || currentVideoId() === item.song.videoId)) return; // already on it
    console.log("[player] play", item.song.videoId, item.song.title);
    this.item = item;
    this.started = false;
    this.finished = false;
    this.waitedMs = 0;
    this.lastProgress = 0;
    if (currentVideoId() !== item.song.videoId) {
      // A full navigation: the reloaded tab reconnects and the background sends this item again.
      location.assign(`/watch?v=${encodeURIComponent(item.song.videoId)}`);
      return;
    }
    const video = videoEl();
    if (video) {
      if (video.ended || video.currentTime > 1) video.currentTime = 0;
      void video.play().catch(() => {});
    }
    this.startTicking();
  }

  /** Nothing left to play: pause whatever is on screen. */
  stop() {
    this.item = null;
    videoEl()?.pause();
  }

  command(command: "pause" | "resume" | "restart") {
    const video = videoEl();
    if (!video) return;
    if (command === "pause") video.pause();
    else if (command === "resume") void video.play().catch(() => {});
    else {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }

  private startTicking() {
    if (!this.timer) this.timer = setInterval(this.tick, TICK_MS);
  }

  private tick = () => {
    const item = this.item;
    const video = videoEl();

    // YouTube moved on by itself (autoplay, end screen click): hold it until the room says what's next.
    if ((!item || this.finished) && video && !video.paused && !adShowing()) {
      if (!item || currentVideoId() !== item.song.videoId || this.finished) video.pause();
    }
    if (!item || this.finished) return;
    if (currentVideoId() !== item.song.videoId) return; // navigation in progress

    if (youtubeError()) return this.finish("error");

    if (adShowing()) return; // ads play in the same <video>; wait them out

    if (!this.started) {
      if (video && !video.paused && video.currentTime > 0 && video.readyState >= 2) {
        this.started = true;
        this.lastProgress = Date.now();
        this.report({ type: "event", event: "started", itemId: item.id, positionSec: video.currentTime, durationSec: durationOf(video) });
        return;
      }
      if (video?.paused && video.readyState >= 2) void video.play().catch(() => {});
      this.waitedMs += TICK_MS;
      if (this.waitedMs >= START_TIMEOUT_MS) this.finish("error");
      return;
    }

    if (video && Date.now() - this.lastProgress >= PROGRESS_EVERY_MS) {
      this.lastProgress = Date.now();
      this.report({ type: "event", event: "progress", itemId: item.id, positionSec: video.currentTime, durationSec: durationOf(video) });
    }
  };

  private onEnded = (e: Event) => {
    if (e.target !== videoEl() || !this.item || !this.started || adShowing()) return;
    if (currentVideoId() !== this.item.song.videoId) return;
    // Stop YouTube's "up next" autoplay countdown before it takes over.
    document.querySelector<HTMLElement>(".ytp-autonav-endscreen-upnext-cancel-button")?.click();
    this.finish("ended");
  };

  private finish(event: "ended" | "error") {
    if (!this.item || this.finished) return;
    this.finished = true;
    console.log("[player]", event, this.item.song.videoId);
    this.report({ type: "event", event, itemId: this.item.id });
  }
}
