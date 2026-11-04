import type { QueueItem } from "@karaoke-tube/shared";

/** Minimal typing for the bits of the YouTube IFrame Player API we use. */
export type YTPlayer = {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  mute(): void;
  unMute(): void;
  getPlayerState(): number;
  destroy(): void;
};
type YTGlobal = {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type PlayerReport = (event: "started" | "progress" | "ended" | "error", itemId: string, positionSec?: number, durationSec?: number) => void;

/** No sign of the video playing after this long → `error`. */
const START_TIMEOUT_MS = 15_000;
const PROGRESS_EVERY_MS = 5_000;
const TICK_MS = 500;
/** Resume only when the song was this far in. */
const RESUME_MIN_SEC = 3;
// YT.PlayerState
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

let apiPromise: Promise<YTGlobal> | null = null;
export function loadApi(): Promise<YTGlobal> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("Couldn't load the YouTube player"));
    };
    document.head.append(s);
  });
  return apiPromise;
}

/** Plays queue items with the official YouTube IFrame Player and reports what happens. */
export class TvPlayer {
  private yt: YTPlayer | null = null;
  private ready = false;
  private item: QueueItem | null = null;
  private pending: { item: QueueItem; startAt: number; paused: boolean } | null = null;
  private started = false;
  private finished = false;
  private wantPaused = false;
  private waitedMs = 0;
  private lastProgress = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastState = -1;

  /** `target` is an element the player replaces with its iframe; `wrap` is shown/hidden around it. */
  constructor(
    private readonly target: HTMLElement,
    private readonly wrap: HTMLElement,
    private readonly report: PlayerReport,
    private readonly onReady: () => void,
  ) {
    this.show(false);
    loadApi()
      .then((YT) => {
        this.yt = new YT.Player(this.target, {
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1 },
          events: {
            onReady: () => {
              this.ready = true;
              this.timer = setInterval(this.tick, TICK_MS);
              this.onReady();
              if (this.pending) this.play(this.pending.item, this.pending.startAt, this.pending.paused);
            },
            onStateChange: (e: { data: number }) => this.onState(e.data),
            onError: () => this.finish("error"),
          },
        });
      })
      .catch((e) => console.warn("[tv]", e));
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.yt?.destroy();
    } catch {
      // ignore
    }
    this.yt = null;
  }

  private show(on: boolean) {
    this.wrap.style.visibility = on ? "visible" : "hidden";
  }

  /** Plays `item`; `startAt` resumes a song that was already going (rejoin); `paused` starts it paused (TV reopened mid-pause). */
  play(item: QueueItem, startAt = 0, paused = false) {
    if (!this.ready || !this.yt) {
      this.pending = { item, startAt, paused };
      return;
    }
    this.pending = null;
    if (this.item?.id === item.id) return; // already on it
    const resumeAt = startAt > RESUME_MIN_SEC ? Math.floor(startAt) : 0;
    console.log("[tv] play", item.song.videoId, item.song.title, resumeAt ? `from ${resumeAt}s` : "");
    this.item = item;
    this.started = false;
    this.finished = false;
    this.wantPaused = paused;
    this.waitedMs = 0;
    this.lastProgress = 0;
    this.show(true);
    this.yt.loadVideoById({ videoId: item.song.videoId, startSeconds: resumeAt });
  }

  /** Nothing left to play: stop the video and hide the iframe so no recommendations show. */
  stop() {
    this.pending = null;
    this.item = null;
    this.wantPaused = false;
    if (this.ready) this.yt?.stopVideo();
    this.show(false);
  }

  command(command: "pause" | "resume" | "restart") {
    if (!this.ready || !this.yt || !this.item) {
      // A TV that reconnects while a song is paused is sent `play` and then `pause`, maybe before its player is up:
      // the pause belongs to the song waiting to start (a stray pause with nothing waiting is ignored, as before).
      if (this.pending && command === "pause") this.pending.paused = true;
      else if (this.pending && command === "resume") this.pending.paused = false;
      return;
    }
    if (this.finished) return;
    if (command === "pause") {
      this.wantPaused = true;
      if (this.started) this.yt.pauseVideo();
    } else {
      this.wantPaused = false;
      if (command === "restart") this.yt.seekTo(0, true);
      this.yt.playVideo();
    }
  }

  private onState(s: number) {
    this.lastState = s;
    const item = this.item;
    if (!item || this.finished) return;
    if (s === PLAYING && !this.started) {
      this.started = true;
      this.lastProgress = Date.now();
      const d = this.yt?.getDuration();
      this.report("started", item.id, this.yt?.getCurrentTime(), d && d > 0 ? d : undefined);
    }
    if (s === PLAYING && this.wantPaused) this.yt?.pauseVideo();
    if (s === ENDED) this.finish("ended");
  }

  private tick = () => {
    const item = this.item;
    if (!item || this.finished || !this.yt) return;
    if (!this.started) {
      // Autoplay can leave the video paused; nudge it.
      if (this.lastState === PAUSED && !this.wantPaused) this.yt.playVideo();
      // Ads play with state PLAYING and count as started; only buffering/unstarted time is waited out here.
      if (this.lastState !== PAUSED || !this.wantPaused) this.waitedMs += TICK_MS;
      if (this.waitedMs >= START_TIMEOUT_MS) this.finish("error");
      return;
    }
    if (this.lastState !== BUFFERING && Date.now() - this.lastProgress >= PROGRESS_EVERY_MS) {
      this.lastProgress = Date.now();
      const d = this.yt.getDuration();
      this.report("progress", item.id, this.yt.getCurrentTime(), d && d > 0 ? d : undefined);
    }
  };

  private finish(event: "ended" | "error") {
    const item = this.item;
    if (!item || this.finished) return;
    this.finished = true;
    console.log("[tv]", event, item.song.videoId);
    try {
      this.yt?.stopVideo();
    } catch {
      // ignore
    }
    this.show(false); // no YouTube end screen / recommendations between songs
    this.report(event, item.id);
  }
}
