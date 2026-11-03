import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { Reaction, RoomState } from "@karaoke-tube/shared";
import { GetReadyCard, TvOverlay, TV_REACTION_MS, tvCss, type TvReaction } from "@karaoke-tube/ui/tv";
import { WEB_URL } from "@/utils/api";

export type ReactionFeed = (listener: (e: { memberId: string; reaction: Reaction }) => void) => () => void;

/** B's TV overlay, fed by the room state the background forwards. Rendered inside a shadow root over `#movie_player`. */
export function TvLayer({ state, onReaction }: { state: RoomState; onReaction: ReactionFeed }) {
  const [qr, setQr] = useState<string>();
  const [reactions, setReactions] = useState<TvReaction[]>([]);
  const seq = useRef(0);
  const members = useRef(state.members);
  members.current = state.members;
  const joinUrl = `${WEB_URL}/join/${state.code}`;

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 300 }).then((src) => live && setQr(src));
    return () => {
      live = false;
    };
  }, [joinUrl]);

  // Keep each reaction for TV_REACTION_MS, then drop it.
  useEffect(
    () =>
      onReaction((e) => {
        const r: TvReaction = {
          id: seq.current++,
          reaction: e.reaction,
          nickname: members.current.find((m) => m.id === e.memberId)?.nickname,
        };
        setReactions((xs) => [...xs.slice(-20), r]);
        setTimeout(() => setReactions((xs) => xs.filter((x) => x.id !== r.id)), TV_REACTION_MS);
      }),
    [onReaction],
  );

  const { playback, nowPlaying } = state;
  return (
    <>
      <style>{tvCss}</style>
      {playback.state === "get_ready" && nowPlaying && playback.countdownEndsAt ? (
        <GetReadyCard
          item={nowPlaying}
          members={state.members}
          countdownEndsAt={playback.countdownEndsAt}
          countdownSec={state.settings.countdownSec}
        />
      ) : (
        <TvOverlay
          nowPlaying={nowPlaying}
          upNext={state.upNext}
          members={state.members}
          code={state.code}
          qrSrc={qr}
          joinText={`${new URL(WEB_URL).host}/join`}
          reactions={reactions}
        />
      )}
    </>
  );
}

const FIGTREE_WEIGHTS = [400, 700, 800] as const;

/** `@font-face` doesn't work inside a shadow root, so Figtree is declared once at document level. */
export function injectFigtree() {
  if (document.getElementById("kt-figtree")) return;
  const style = document.createElement("style");
  style.id = "kt-figtree";
  style.textContent = FIGTREE_WEIGHTS.map(
    (w) =>
      `@font-face{font-family:"Figtree";font-style:normal;font-weight:${w};font-display:swap;` +
      `src:url("${browser.runtime.getURL(`/fonts/figtree-latin-${w}-normal.woff2` as "/")}") format("woff2");}`,
  ).join("\n");
  document.head.append(style);
}
