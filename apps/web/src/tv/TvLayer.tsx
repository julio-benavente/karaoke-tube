import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Reaction, RoomState } from "@karaoke-tube/shared";
import { AwardsShow, GetReadyCard, TvOverlay, TV_REACTION_MS, tvCss, type TvReaction } from "@karaoke-tube/ui/tv";
import { useT } from "@karaoke-tube/ui";
import { WEB_URL } from "../host/client";

export type ReactionFeed = (listener: (e: { memberId: string; reaction: Reaction }) => void) => () => void;

/** A QR code image (data URL) for `url`. */
export function useQr(url: string, width = 300) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width }).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [url, width]);
  return src;
}

/** Mounts children in an open shadow root with only tvCss, so the overlay's styles stay isolated. */
function ShadowMount({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = tvCss;
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0;";
    shadow.append(style, mount);
    setRoot(mount);
  }, []);
  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60 }}>
      {root && createPortal(children, root)}
    </div>
  );
}

/** The TV overlay (now singing, up next, QR, reactions, get-ready card, awards show) over the player. */
export function TvLayer({ state, onReaction, flash = false }: { state: RoomState; onReaction: ReactionFeed; flash?: boolean }) {
  const t = useT();
  const qr = useQr(`${WEB_URL}/join/${state.code}`);
  const [recapQr, setRecapQr] = useState<string>();
  const [reactions, setReactions] = useState<TvReaction[]>([]);
  const seq = useRef(0);
  const members = useRef(state.members);
  members.current = state.members;
  const recapId = state.recap?.id;
  const recapUrl = recapId ? `${WEB_URL}/recap/${recapId}` : null;

  useEffect(() => {
    if (!recapUrl) return;
    let live = true;
    QRCode.toDataURL(recapUrl, { margin: 1, width: 300 }).then((src) => live && setRecapQr(src));
    return () => {
      live = false;
    };
  }, [recapUrl]);

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
  const joinInfo = state.settings.joinInfo ?? "between";
  const joinText = `${new URL(WEB_URL).host}/join`;
  return (
    <ShadowMount>
      {state.recap ? (
        <AwardsShow t={t} recap={state.recap} qrSrc={recapQr} recapText={recapUrl ? recapUrl.replace(/^https?:\/\//, "") : undefined} />
      ) : playback.state === "get_ready" && nowPlaying && playback.countdownEndsAt ? (
        <GetReadyCard t={t} item={nowPlaying} members={state.members} countdownEndsAt={playback.countdownEndsAt} countdownSec={state.settings.countdownSec}
          join={flash || joinInfo !== "start" ? { code: state.code, qrSrc: qr, joinText } : undefined}
        />
      ) : (
        <TvOverlay
          t={t}
          nowPlaying={nowPlaying}
          upNext={state.upNext}
          members={state.members}
          code={state.code}
          qrSrc={qr}
          joinText={joinText}
          reactions={reactions}
          hideJoin={!(flash || joinInfo === "always")}
          // The bar is for while a song is on; the lobby already shows the join QR + code full screen.
          layout={nowPlaying ? (state.settings.tvHideBar ? "video" : (state.settings.tvLayout ?? "bar")) : "overlay"}
          barSize={state.settings.tvBarSize ?? "medium"}
        />
      )}
    </ShadowMount>
  );
}
