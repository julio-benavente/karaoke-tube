import { formatRoomCode } from "@karaoke-tube/shared";
import type { CSSProperties } from "react";
import { REACTION_EMOJI, TV_BAR_PERCENT, type Member, type QueueItem, type Reaction, type TvBarSize, type TvLayout } from "@karaoke-tube/shared";
import { avatarUri } from "../avatar";
import { singerLabel as itemSingers, singerSeeds, songParts } from "../format";
import { detectLang, makeT, type TFn } from "../i18n/core";

/** How long a floating reaction animates. Remove it from `reactions` after this. */
export const TV_REACTION_MS = 3000;

export type TvReaction = {
  /** Unique per reaction (used as the React key, so each one animates once). */
  id: string | number;
  reaction: Reaction;
  /** Shown under the emoji when given. */
  nickname?: string;
};

export type TvOverlayProps = {
  nowPlaying: QueueItem | null;
  /** The next item in line (or the whole `upNext`; only the first is shown). */
  upNext: QueueItem[];
  members: Member[];
  code: string;
  /** QR code image (data URL) for the join link. Hidden when missing. */
  qrSrc?: string;
  /** Short join address shown under the code, e.g. "karaoke.tube/join". */
  joinText?: string;
  reactions: TvReaction[];
  /** Hide the join card (e.g. host turned it off or the video is small). */
  hideJoin?: boolean;
  /**
   * "overlay" (default): chips and join card float over the video. "bar": a bar of its own along the bottom with the
   * singer, what is up next and the join QR + code; the page leaves that space free so nothing covers the video.
   */
  layout?: TvLayout | "overlay";
  /** Height of the bar, when `layout` is "bar". */
  barSize?: TvBarSize;
  /** Translator (these render in a shadow root, outside the app's React tree). Default: the saved/browser language. */
  t?: TFn;
};

const name = (members: Member[], id: string | undefined) => members.find((m) => m.id === id);

/** The avatar of whoever sings, or two overlapping ones (up to three) for a duet. `wrap` styles the overlap. */
export function SingerAvatars({ item, members, wrap, className }: { item: QueueItem; members: Member[]; wrap: string; className: string }) {
  const seeds = singerSeeds(item, members);
  const shown = (item.everyone ? seeds.slice(0, 1) : seeds.slice(0, 3)).map((s) => avatarUri(s));
  const srcs = shown.length ? shown : [avatarUri(item.id)];
  return (
    <span className={wrap}>
      {srcs.map((src, i) => (
        <img key={i} className={className} src={src} alt="" />
      ))}
    </span>
  );
}

/**
 * T1: overlay on the YouTube player. Now-singing chip, up-next chip, QR + code, floating reactions.
 * Pure: props in, no room access. Render inside the player element (and a shadow root) with `tvCss`.
 */
export function TvOverlay({ nowPlaying, upNext, members, code, qrSrc, joinText, reactions, hideJoin, layout = "overlay", barSize = "medium", t = makeT(detectLang()) }: TvOverlayProps) {
  const bar = layout === "bar";
  const next = upNext[0];
  const nowParts = nowPlaying ? songParts(nowPlaying.song) : null;
  const nextParts = next ? songParts(next.song) : null;
  const singerLabel = (item: QueueItem) => itemSingers(item, members, undefined, t);

  return (
    <div className="kt-tv" aria-hidden="true">
      {bar && (
        <div className="kt-tvbar" style={{ ["--b" as string]: TV_BAR_PERCENT[barSize] } as CSSProperties}>
          <div className="kt-tvbar-now">
            {nowPlaying && nowParts ? (
              <>
                <SingerAvatars item={nowPlaying} members={members} wrap="kt-tv-avatars kt-tvbar-avatars" className="kt-tvbar-avatar" />
                <div className="kt-tvbar-text" key={nowPlaying.id}>
                  <span className="kt-tvbar-kicker">{t("queue.nowSinging")}</span>
                  <span className="kt-tvbar-singer">{singerLabel(nowPlaying)}</span>
                  <span className="kt-tvbar-song">
                    {nowParts.title} · {nowParts.artist}
                  </span>
                </div>
              </>
            ) : (
              <div className="kt-tvbar-text">
                <span className="kt-tvbar-singer">{t("tv.addSongs")}</span>
              </div>
            )}
          </div>
          {next && nextParts && (
            <div className="kt-tvbar-next">
              <span className="kt-tvbar-kicker">{t("tv.upNext")}</span>
              <span className="kt-tvbar-nextsinger">{singerLabel(next)}</span>
              <span className="kt-tvbar-song">{nextParts.title}</span>
            </div>
          )}
          <div className="kt-tvbar-join">
            {qrSrc && (
              <div className="kt-tvbar-qr">
                <img src={qrSrc} alt="" />
              </div>
            )}
            <div className="kt-tvbar-jointext">
              <span className="kt-tvbar-kicker">{t("join.title")}</span>
              <span className="kt-tvbar-code">{formatRoomCode(code)}</span>
              {joinText && <span className="kt-tvbar-url">{joinText}</span>}
            </div>
          </div>
        </div>
      )}
      {!bar && nowPlaying && nowParts && (
        <div className="kt-tv-chip kt-tv-now" key={nowPlaying.id}>
          <SingerAvatars item={nowPlaying} members={members} wrap="kt-tv-avatars" className="kt-tv-avatar" />
          <div className="kt-tv-chiptext">
            <span className="kt-tv-kicker">{t("queue.nowSinging")}</span>
            <span className="kt-tv-singer">{singerLabel(nowPlaying)}</span>
            <span className="kt-tv-song">
              {nowParts.title} · {nowParts.artist}
            </span>
          </div>
        </div>
      )}

      {!bar && next && nextParts && (
        <div className="kt-tv-chip kt-tv-next" key={next.id}>
          <SingerAvatars item={next} members={members} wrap="kt-tv-avatars" className="kt-tv-avatar" />
          <span className="kt-tv-nextline">
            <span>{t("tv.upNext")} </span>
            <b>{singerLabel(next)}</b>
            <span> · {nextParts.title}</span>
          </span>
        </div>
      )}

      {!bar && !hideJoin && (
        <div className="kt-tv-join">
          {qrSrc && (
            <div className="kt-tv-qr">
              <img src={qrSrc} alt="" />
            </div>
          )}
          <div className="kt-tv-jointext">
            <span className="kt-tv-joinlabel">{t("join.title")}</span>
            <span className="kt-tv-code">{formatRoomCode(code)}</span>
            {joinText && <span className="kt-tv-url">{joinText}</span>}
          </div>
        </div>
      )}

      <div className="kt-tv-reactions">
        {reactions.map((r) => {
          const n = typeof r.id === "number" ? r.id : hash(r.id);
          return (
            <span
              key={r.id}
              className="kt-tv-float"
              style={
                {
                  left: `${(n * 37) % 70}%`,
                  "--kt-tv-drift": `${((n * 13) % 7) - 3}cqw`,
                  "--kt-tv-tilt": `${((n * 17) % 30) - 15}deg`,
                } as CSSProperties
              }
            >
              <span className="kt-tv-emoji">{REACTION_EMOJI[r.reaction]}</span>
              {r.nickname && <span className="kt-tv-who">{r.nickname}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
