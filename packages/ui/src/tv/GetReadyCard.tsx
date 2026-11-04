import { useEffect, useState } from "react";
import { formatRoomCode, type Member, type QueueItem } from "@karaoke-tube/shared";
import { avatarUri } from "../avatar";
import { singerLabel, songParts } from "../format";
import { detectLang, makeT, type TFn } from "../i18n/core";

export type GetReadyCardProps = {
  item: QueueItem;
  members: Member[];
  /** Epoch ms when the countdown ends (`playback.countdownEndsAt`). */
  countdownEndsAt: number;
  /** Total countdown length, for the ring. Default: `settings.countdownSec` or 5. */
  countdownSec?: number;
  /** Small "join the party" block (QR + code) in a corner of the card. Hidden when missing. */
  join?: { code: string; qrSrc?: string; joinText?: string };
  /** Translator (shadow-root safe). Default: the saved/browser language. */
  t?: TFn;
};

/**
 * T2: full-player card between songs: avatar, name, song, countdown.
 * Pure apart from a local clock for the countdown. Render inside the player (and a shadow root) with `tvCss`.
 */
export function GetReadyCard({ item, members, countdownEndsAt, countdownSec = 5, join, t = makeT(detectLang()) }: GetReadyCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const singers = item.singerIds.map((id) => members.find((m) => m.id === id));
  const first = singers[0];
  const label = singerLabel(item, members, undefined, t);
  const { title, artist } = songParts(item.song);
  const msLeft = Math.max(0, countdownEndsAt - now);
  const secs = Math.ceil(msLeft / 1000);
  const total = Math.max(1, countdownSec) * 1000;
  const R = 44;
  const C = 2 * Math.PI * R;
  const progress = Math.min(1, msLeft / total);

  return (
    <div className="kt-tv kt-tv-ready" role="status" aria-live="polite">
      <div className="kt-tv-ready-bg" style={{ backgroundImage: `url("${item.song.thumbnailUrl}")` }} />
      <div className="kt-tv-ready-shade" />
      <div className="kt-tv-ready-body">
        <img className="kt-tv-ready-avatar" src={avatarUri(first?.avatarSeed ?? item.id)} alt="" />
        <div className="kt-tv-ready-text">
          <span className="kt-tv-ready-kicker">{t("now.getReady")}</span>
          <span className="kt-tv-ready-name">{label}</span>
          <span className="kt-tv-ready-song">{title}</span>
          <span className="kt-tv-ready-artist">{artist}</span>
          <div className="kt-tv-count">
            <svg viewBox="0 0 100 100" aria-hidden>
              <circle className="kt-tv-track" cx="50" cy="50" r={R} />
              <circle className="kt-tv-ring" cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
            </svg>
            <b key={secs} className="kt-tv-tick" data-countdown={secs}>
              {secs}
            </b>
          </div>
        </div>
      </div>
      {join && (
        <div className="kt-tv-join kt-tv-ready-join">
          {join.qrSrc && (
            <div className="kt-tv-qr">
              <img src={join.qrSrc} alt="" />
            </div>
          )}
          <div className="kt-tv-jointext">
            <span className="kt-tv-joinlabel">{t("join.title")}</span>
            <span className="kt-tv-code">{formatRoomCode(join.code)}</span>
            {join.joinText && <span className="kt-tv-url">{join.joinText}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
