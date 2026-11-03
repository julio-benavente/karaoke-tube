import ReactDOM from "react-dom/client";
import type { Reaction, RoomState } from "@karaoke-tube/shared";
import { PLAYER_PORT, type PlayerPortToBackground, type PlayerPortToTab } from "@/utils/ports";
import { YouTubePlayer } from "./player";
import { TvLayer, injectFigtree, setPartyStyles, type ReactionFeed } from "./TvLayer";

const PING_EVERY_MS = 20_000;

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  // Styles live inside a shadow root, isolated from YouTube's CSS.
  cssInjectionMode: "ui",

  async main(ctx) {
    // Runs on every YouTube tab, but only the party's window (the background knows its tab id) does anything.
    let player: YouTubePlayer | null = null;
    let state: RoomState | null = null;
    const reactionListeners = new Set<(e: { memberId: string; reaction: Reaction }) => void>();
    const onReaction: ReactionFeed = (listener) => {
      reactionListeners.add(listener);
      return () => reactionListeners.delete(listener);
    };
    let root: ReactDOM.Root | null = null;
    let ui: Awaited<ReturnType<typeof createShadowRootUi<ReactDOM.Root>>> | null = null;
    let port: Browser.runtime.Port | null = null;
    let isParty = false;

    const render = () => {
      if (root && state) root.render(<TvLayer state={state} onReaction={onReaction} />);
    };

    const mountOverlay = async () => {
      if (ui) return;
      injectFigtree();
      setPartyStyles(true);
      ui = await createShadowRootUi(ctx, {
        name: "karaoke-tube-overlay",
        // Inside the player element, so it's still there in fullscreen.
        position: "inline",
        anchor: "#movie_player",
        append: "last",
        onMount(container, _shadow, shadowHost) {
          // Cover the whole player; the TV components position themselves inside it.
          shadowHost.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:60;";
          container.style.cssText = "position:absolute;inset:0;";
          root = ReactDOM.createRoot(container);
          render();
          return root;
        },
        onRemove(r) {
          r?.unmount();
          root = null;
        },
      });
      // `#movie_player` appears after YouTube boots and can be replaced on navigation.
      ui.autoMount();
    };

    const send = (msg: PlayerPortToBackground) => {
      try {
        port?.postMessage(msg);
      } catch {
        // port is reconnecting; the room times out a song that never reports, so dropping one event is fine
      }
    };

    const leave = () => {
      isParty = false;
      player?.dispose();
      player = null;
      ui?.remove();
      ui = null;
      setPartyStyles(false);
    };

    const connect = () => {
      const p = browser.runtime.connect({ name: PLAYER_PORT });
      port = p;
      p.onMessage.addListener((raw) => {
        const msg = raw as PlayerPortToTab;
        switch (msg.type) {
          case "not_party":
            if (isParty) console.log("[content] party ended");
            leave();
            break;
          case "party":
            console.log("[content] this is the party's YouTube window, room", msg.code);
            isParty = true;
            state = msg.state ?? state;
            player ??= new YouTubePlayer(send);
            void mountOverlay();
            render();
            break;
          case "state":
            state = msg.state;
            render();
            break;
          case "reaction":
            for (const l of [...reactionListeners]) l(msg);
            break;
          case "fullscreen":
            // Needs a user gesture in the tab; when Chrome refuses, the window is still full screen (background).
            void document
              .querySelector<HTMLElement>("#movie_player")
              ?.requestFullscreen()
              .catch(() => console.log("[content] player fullscreen needs a click or F on the TV window"));
            break;
          case "play":
            player?.play(msg.item, msg.startAt);
            break;
          case "command":
            player?.command(msg.command);
            break;
          case "stop":
            player?.stop();
            break;
        }
      });
      p.onDisconnect.addListener(() => {
        if (port !== p) return;
        port = null;
        // The service worker restarted: reconnect if we were the party's tab.
        if (isParty && ctx.isValid) ctx.setTimeout(connect, 1000);
      });
    };

    connect();
    // Keeps the background service worker awake while the party runs.
    ctx.setInterval(() => isParty && send({ type: "ping" }), PING_EVERY_MS);
    ctx.onInvalidated(leave);
  },
});
