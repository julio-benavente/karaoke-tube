import { useEffect, useState } from "react";
import { TITLE_INFO, type Recap } from "@karaoke-tube/shared";
import { avatarUri } from "../avatar";
import { songParts } from "../format";

export type AwardsShowProps = {
  recap: Recap;
  /** Where the recap lives, shown on the last card (for example "karaoke.example/recap/abc"). */
  recapText?: string;
  /** QR code (data URL) that points at the recap page. */
  qrSrc?: string;
  /** Speeds the show up or slows it down; 1 = normal. */
  speed?: number;
};

type Slide =
  | { kind: "intro"; ms: number }
  | { kind: "member"; memberId: string; ms: number }
  | { kind: "moment"; ms: number }
  | { kind: "finale"; ms: number };

const INTRO_MS = 4500;
const MEMBER_BASE_MS = 1600;
const MEMBER_PER_TITLE_MS = 1700;
const MOMENT_MS = 6000;
const FINALE_MS = 7000;

/** Bits of confetti: fixed positions so the render is stable. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 40) / 10,
  dur: 5 + ((i * 29) % 30) / 10,
  hue: (i * 47) % 360,
  size: 0.7 + ((i * 13) % 8) / 10,
}));

/**
 * C5: the end-of-night awards show for the TV. Cycles through everyone's titles, then the moment of the night
 * and a thank-you card, and starts over until the content script takes it away. Presentational; shadow-root safe.
 */
export function AwardsShow({ recap, recapText, qrSrc, speed = 1 }: AwardsShowProps) {
  // Not memoized on `recap`: the room sends a fresh copy with every state, and the timers must not restart.
  const slides = ((): Slide[] => {
    const out: Slide[] = [{ kind: "intro", ms: INTRO_MS }];
    for (const m of recap.members) {
      const n = recap.titles[m.id]?.length ?? 0;
      if (n > 0) out.push({ kind: "member", memberId: m.id, ms: MEMBER_BASE_MS + n * MEMBER_PER_TITLE_MS });
    }
    if (recap.topMoment && recap.topMoment.cheers > 0) out.push({ kind: "moment", ms: MOMENT_MS });
    out.push({ kind: "finale", ms: FINALE_MS });
    return out;
  })();

  const [index, setIndex] = useState(0);
  const slide = slides[index % slides.length]!;
  useEffect(() => {
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), slide.ms / speed);
    return () => clearTimeout(t);
  }, [index, slide.ms, slides.length, speed]);

  return (
    <div className="kt-tv kt-tv-awards" role="status" aria-live="polite">
      <div className="kt-tv-aw-glow" />
      <div className="kt-tv-aw-confetti" aria-hidden>
        {CONFETTI.map((c, i) => (
          <i
            key={i}
            style={{
              left: `${c.left}%`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.dur}s`,
              background: `hsl(${c.hue} 90% 65%)`,
              width: `${c.size}cqw`,
              height: `${c.size * 1.6}cqw`,
            }}
          />
        ))}
      </div>

      <div className="kt-tv-aw-stage" key={`${index}-${slide.kind}`}>
        {slide.kind === "intro" && <Intro recap={recap} />}
        {slide.kind === "member" && <MemberSlide recap={recap} memberId={slide.memberId} />}
        {slide.kind === "moment" && <Moment recap={recap} />}
        {slide.kind === "finale" && <Finale recap={recap} recapText={recapText} qrSrc={qrSrc} />}
      </div>

      <div className="kt-tv-aw-dots" aria-hidden>
        {slides.map((_, i) => (
          <i key={i} className={i === index % slides.length ? "kt-tv-aw-on" : undefined} />
        ))}
      </div>
    </div>
  );
}

function Intro({ recap }: { recap: Recap }) {
  const songs = recap.performances.length;
  const singers = new Set(recap.performances.flatMap((p) => p.item.singerIds)).size;
  return (
    <div className="kt-tv-aw-center">
      <span className="kt-tv-aw-kicker">That's a wrap</span>
      <span className="kt-tv-aw-big">And the awards go to…</span>
      <span className="kt-tv-aw-sub">
        {songs === 0
          ? `${recap.members.length} ${recap.members.length === 1 ? "person" : "people"} came to the party`
          : `${songs} ${songs === 1 ? "song" : "songs"} · ${singers} ${singers === 1 ? "singer" : "singers"} · ${recap.members.length} at the party`}
      </span>
    </div>
  );
}

function MemberSlide({ recap, memberId }: { recap: Recap; memberId: string }) {
  const member = recap.members.find((m) => m.id === memberId);
  const titles = recap.titles[memberId] ?? [];
  if (!member) return null;
  return (
    <div className="kt-tv-aw-member">
      <img className="kt-tv-aw-avatar" src={avatarUri(member.avatarSeed)} alt="" />
      <div className="kt-tv-aw-text">
        <span className="kt-tv-aw-name">{member.nickname}</span>
        <div className="kt-tv-aw-titles">
          {titles.map((id, i) => {
            const info = TITLE_INFO[id];
            return (
              <div className="kt-tv-aw-title" key={id} style={{ animationDelay: `${0.6 + i * 1.7}s` }}>
                <span className="kt-tv-aw-emoji">{info.emoji}</span>
                <span className="kt-tv-aw-titletext">
                  <b>{info.name}</b>
                  <span>{info.description}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Moment({ recap }: { recap: Recap }) {
  const moment = recap.topMoment;
  if (!moment) return null;
  const { title, artist } = songParts(moment.item.song);
  const names = moment.item.singerIds.map((id) => recap.members.find((m) => m.id === id)?.nickname ?? "Someone");
  const first = recap.members.find((m) => m.id === moment.item.singerIds[0]);
  return (
    <div className="kt-tv-aw-member">
      <img className="kt-tv-aw-avatar" src={avatarUri(first?.avatarSeed ?? moment.item.id)} alt="" />
      <div className="kt-tv-aw-text">
        <span className="kt-tv-aw-kicker">Moment of the night</span>
        <span className="kt-tv-aw-name">{title}</span>
        <span className="kt-tv-aw-sub">
          {artist} · {names.join(" & ")}
        </span>
        <span className="kt-tv-aw-cheers">🙌 {moment.cheers} cheers</span>
      </div>
    </div>
  );
}

function Finale({ recap, recapText, qrSrc }: { recap: Recap; recapText?: string; qrSrc?: string }) {
  return (
    <div className="kt-tv-aw-center">
      <span className="kt-tv-aw-kicker">Thanks for singing</span>
      <span className="kt-tv-aw-big">See you at the next one</span>
      <div className="kt-tv-aw-faces" aria-hidden>
        {recap.members.slice(0, 8).map((m, i) => (
          <img key={m.id} src={avatarUri(m.avatarSeed)} alt="" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      {(qrSrc || recapText) && (
        <div className="kt-tv-aw-recap">
          {qrSrc && <img src={qrSrc} alt="" />}
          <span>
            Your recap
            {recapText && <b>{recapText}</b>}
          </span>
        </div>
      )}
    </div>
  );
}
