import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { Reaction, RoomState } from "@karaoke-tube/shared";
import { LANG_STORAGE_KEY, detectLang, isLang, makeT, type Lang } from "@karaoke-tube/ui";
import { AwardsShow, GetReadyCard, TvOverlay, TV_REACTION_MS, tvCss, type TvReaction } from "@karaoke-tube/ui/tv";
import { WEB_URL } from "@/utils/api";

export type ReactionFeed = (listener: (e: { memberId: string; reaction: Reaction }) => void) => () => void;

/** B's TV overlay, fed by the room state the background forwards. Rendered inside a shadow root over `#movie_player`. */
export function TvLayer({ state, onReaction }: { state: RoomState; onReaction: ReactionFeed }) {
  // Language: the popup saves it in extension storage (the page's own localStorage is YouTube's).
  const [lang, setLang] = useState<Lang>(detectLang);
  useEffect(() => {
    const apply = (v: unknown) => isLang(v) && setLang(v);
    browser.storage.local.get(LANG_STORAGE_KEY).then((r) => apply(r[LANG_STORAGE_KEY]), () => {});
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && changes[LANG_STORAGE_KEY]) apply(changes[LANG_STORAGE_KEY].newValue);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  // A session has one language: the room's, not the one picked in the popup.
  const t = makeT(state.settings.language ?? lang);
  const [qr, setQr] = useState<string>();
  const [reactions, setReactions] = useState<TvReaction[]>([]);
  const seq = useRef(0);
  const members = useRef(state.members);
  members.current = state.members;
  const [recapQr, setRecapQr] = useState<string>();
  const joinUrl = `${WEB_URL}/join/${state.code}`;
  const recapId = state.recap?.id;
  const recapUrl = recapId ? `${WEB_URL}/recap/${recapId}` : null;

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 300 }).then((src) => live && setQr(src));
    return () => {
      live = false;
    };
  }, [joinUrl]);

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
  return (
    <>
      <style>{tvCss}</style>
      {state.recap ? (
        // The party is over: the awards show replaces the normal overlay until the background lets the TV go.
        <AwardsShow t={t} recap={state.recap} qrSrc={recapQr} recapText={recapUrl ? recapUrl.replace(/^https?:\/\//, "") : undefined} />
      ) : playback.state === "get_ready" && nowPlaying && playback.countdownEndsAt ? (
        <GetReadyCard
          t={t}
          item={nowPlaying}
          members={state.members}
          countdownEndsAt={playback.countdownEndsAt}
          countdownSec={state.settings.countdownSec}
        />
      ) : (
        <TvOverlay
          t={t}
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

/**
 * In the party's window only: hide YouTube's end screen (the grid of recommended videos), the end cards in the
 * last seconds, and the "more videos" strip on pause. They'd cover the TV between songs. Ads and branding stay.
 */
const HIDE_RECOMMENDATIONS = `
#movie_player .html5-endscreen, #movie_player .videowall-endscreen, #movie_player .ytp-endscreen-content,
#movie_player .ytp-autonav-endscreen, #movie_player .ytp-ce-element, #movie_player .ytp-ce-covering-overlay,
#movie_player .ytp-pause-overlay, #movie_player .ytp-suggestion-set, #movie_player .ytp-cards-teaser,
#movie_player .ytp-endscreen-previous, #movie_player .ytp-endscreen-next, #movie_player .ytp-fullscreen-grid,
#movie_player .ytp-fullerscreen-edu-button { display: none !important; }`;

export function setPartyStyles(on: boolean) {
  const existing = document.getElementById("kt-party-styles");
  if (!on) return existing?.remove();
  if (existing) return;
  const style = document.createElement("style");
  style.id = "kt-party-styles";
  style.textContent = HIDE_RECOMMENDATIONS;
  document.head.append(style);
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
