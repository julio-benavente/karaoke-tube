import { formatRoomCode } from "@karaoke-tube/shared";
import type { CSSProperties } from "react";
import { REACTION_EMOJI, type Member, type QueueItem, type Reaction } from "@karaoke-tube/shared";
import { avatarUri } from "../avatar";
import { songParts } from "../format";

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
};

const name = (members: Member[], id: string | undefined) => members.find((m) => m.id === id);

/**
 * T1: overlay on the YouTube player. Now-singing chip, up-next chip, QR + code, floating reactions.
 * Pure: props in, no room access. Render inside the player element (and a shadow root) with `tvCss`.
 */
export function TvOverlay({ nowPlaying, upNext, members, code, qrSrc, joinText, reactions, hideJoin }: TvOverlayProps) {
  const next = upNext[0];
  const singer = nowPlaying ? name(members, nowPlaying.singerIds[0]) : undefined;
  const nextSinger = next ? name(members, next.singerIds[0]) : undefined;
  const nowParts = nowPlaying ? songParts(nowPlaying.song) : null;
  const nextParts = next ? songParts(next.song) : null;
  const singerLabel = (item: QueueItem) =>
    item.singerIds.map((id) => name(members, id)?.nickname ?? "Someone").join(" & ");

  return (
    <div className="kt-tv" aria-hidden="true">
      {nowPlaying && nowParts && (
        <div className="kt-tv-chip kt-tv-now" key={nowPlaying.id}>
          <img className="kt-tv-avatar" src={avatarUri(singer?.avatarSeed ?? nowPlaying.id)} alt="" />
          <div className="kt-tv-chiptext">
            <span className="kt-tv-kicker">Now singing</span>
            <span className="kt-tv-singer">{singerLabel(nowPlaying)}</span>
            <span className="kt-tv-song">
              {nowParts.title} · {nowParts.artist}
            </span>
          </div>
        </div>
      )}

      {next && nextParts && (
        <div className="kt-tv-chip kt-tv-next" key={next.id}>
          <img className="kt-tv-avatar" src={avatarUri(nextSinger?.avatarSeed ?? next.id)} alt="" />
          <span className="kt-tv-nextline">
            <span>Up next </span>
            <b>{singerLabel(next)}</b>
            <span> · {nextParts.title}</span>
          </span>
        </div>
      )}

      {!hideJoin && (
        <div className="kt-tv-join">
          {qrSrc && (
            <div className="kt-tv-qr">
              <img src={qrSrc} alt="" />
            </div>
          )}
          <div className="kt-tv-jointext">
            <span className="kt-tv-joinlabel">Join the party</span>
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
