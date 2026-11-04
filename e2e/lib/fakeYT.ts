// A stand-in for the YouTube IFrame API. The TV page uses `window.YT` when it already exists, so tests inject this
// before the page loads. It "plays" a clock, ends by itself after the song's length, and can be told to fail.
// Control it from a test with `tv.fake(...)` (see actors.ts).

export type FakeYTSettings = {
  /** Seconds a song lasts when `durations` has nothing for its video id. */
  defaultDuration: number;
  durations: Record<string, number>;
  /** Video ids that fail with an embed error. */
  failing: Record<string, boolean>;
  /** Video ids that never start (no state change at all). */
  stuck: Record<string, boolean>;
  /** Milliseconds before a loaded video reports PLAYING. */
  startDelayMs: number;
};

export function installFakeYT() {
  const w = window as unknown as Record<string, any>;
  w.__KT_E2E = true;
  // Every room connection the page makes lands in `__ktClients`; errors the room sends go to `__ktErrors`.
  const clients: any[] = [];
  const push = clients.push.bind(clients);
  clients.push = (c: any) => {
    c.onError?.((e: { code: string }) => (w.__ktErrors ??= []).push(e.code));
    c.__reactions = [];
    c.onReaction?.((e: { memberId: string; reaction: string }) => c.__reactions.push(e));
    return push(c);
  };
  w.__ktClients = clients;
  const settings: FakeYTSettings = { defaultDuration: 6, durations: {}, failing: {}, stuck: {}, startDelayMs: 300 };
  w.__fakeYT = { settings, loads: [] as string[], current: null as any };

  class Player {
    private videoId: string | null = null;
    private pos = 0;
    private state = -1;
    private last = 0;
    private timer: any = null;
    private paused = false;
    constructor(_el: HTMLElement, private opts: any) {
      w.__fakeYT.current = this;
      setTimeout(() => this.opts.events?.onReady?.({ target: this }), 50);
    }
    private set(s: number) {
      this.state = s;
      this.opts.events?.onStateChange?.({ data: s });
    }
    private dur() {
      return settings.durations[this.videoId ?? ""] ?? settings.defaultDuration;
    }
    private run() {
      clearInterval(this.timer);
      this.last = Date.now();
      this.timer = setInterval(() => {
        const now = Date.now();
        if (this.state === 1) {
          this.pos += (now - this.last) / 1000;
          if (this.pos >= this.dur()) {
            this.pos = this.dur();
            clearInterval(this.timer);
            this.set(0);
          }
        }
        this.last = now;
      }, 100);
    }
    loadVideoById(o: { videoId: string; startSeconds?: number }) {
      this.videoId = o.videoId;
      this.pos = o.startSeconds ?? 0;
      this.paused = false;
      w.__fakeYT.loads.push(o.videoId);
      if (settings.failing[o.videoId]) return void setTimeout(() => this.opts.events?.onError?.({ data: 101 }), 200);
      if (settings.stuck[o.videoId]) return;
      this.set(3);
      setTimeout(() => {
        if (this.videoId !== o.videoId) return;
        this.set(1);
        this.run();
      }, settings.startDelayMs);
    }
    cueVideoById(o: { videoId: string; startSeconds?: number }) {
      this.videoId = o.videoId;
      this.pos = o.startSeconds ?? 0;
      this.set(5);
    }
    playVideo() {
      this.paused = false;
      if (this.state === 2 || this.state === 5) {
        this.set(1);
        this.run();
      }
    }
    pauseVideo() {
      this.paused = true;
      if (this.state === 1) this.set(2);
    }
    stopVideo() {
      clearInterval(this.timer);
      this.state = 5;
    }
    seekTo(s: number) {
      this.pos = s;
    }
    getCurrentTime() {
      return this.pos;
    }
    getDuration() {
      return this.videoId ? this.dur() : 0;
    }
    getPlayerState() {
      return this.state;
    }
    mute() {}
    unMute() {}
    destroy() {
      clearInterval(this.timer);
    }
  }
  w.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
}
