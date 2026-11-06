import { useEffect, useRef, useState } from "react";
import { TITLE_INFO, type Recap } from "@karaoke-tube/shared";
import { detectLang, makeT, type TFn } from "../i18n/core";
import { titleName } from "../i18n/labels";
import { avatarUri } from "../avatar";

export type AwardsShowProps = {
  recap: Recap;
  /** Translator (shadow-root safe). Default: the saved/browser language. */
  t?: TFn;
  /** Where the recap lives, shown on the last card (for example "karaoke.example/recap/abc"). */
  recapText?: string;
  /** QR code (data URL) that points at the recap page. */
  qrSrc?: string;
  /** Speeds the show up or slows it down; 1 = normal. */
  speed?: number;
  /** Controls for previews: show this slide (0-based) instead of keeping count itself. */
  slideIndex?: number;
  /** Called with the new slide when the show moves on by itself. */
  onSlideChange?: (index: number) => void;
  /** Stay on the current slide. */
  paused?: boolean;
};

type Slide =
  | { kind: "intro"; ms: number }
  | { kind: "credits"; ms: number }
  | { kind: "finale"; ms: number };

const INTRO_MS = 4500;
const FINALE_MS = 7000;
/** Up to this many people fit on one screen, all at once; more roll by like end credits. */
export const CREDITS_FIT_MAX = 12;
/** How long the screen with everyone stays up before the last screen takes over. */
const CREDITS_SHOW_MS = 60_000;
/** On the last screen, the credits rest this long after they finish before they roll again. */
const CREDITS_AGAIN_MS = 10_000;
const CREDITS_ROLL_MIN_SEC = 30;
const CREDITS_ROLL_PER_PERSON_SEC = 6;

/** How long the rolling credits take to scroll past, in seconds. */
const rollSeconds = (people: number) => Math.max(CREDITS_ROLL_MIN_SEC, people * CREDITS_ROLL_PER_PERSON_SEC);

/** Bits of confetti: fixed positions so the render is stable. */
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 60) / 10,
  dur: 9 + ((i * 29) % 40) / 10,
  hue: (i * 47) % 360,
  size: 0.45 + ((i * 13) % 6) / 10,
}));

/**
 * C5: the end-of-night awards show for the TV. Shows an intro, everyone with their titles on one screen for about a minute, then a split screen (the thank-you card and recap link on the left, the credits rolling on the right) that stays until the TV is closed. Starts over until the content script takes it away. Presentational; shadow-root safe.
 */
function buildSlides(recap: Recap): Slide[] {
  const out: Slide[] = [{ kind: "intro", ms: INTRO_MS }];
  const people = recap.members.length;
  // Everyone on one screen for about a minute (a long list rolls by once instead).
  if (people > 0) out.push({ kind: "credits", ms: people <= CREDITS_FIT_MAX ? CREDITS_SHOW_MS : rollSeconds(people) * 1000 + 1500 });
  // The last screen is split: thank-you and recap on one half, the credits rolling on the other. It stays until the TV is closed.
  out.push({ kind: "finale", ms: FINALE_MS });
  return out;
}

/** How many slides the show has for this recap (for preview controls). */
export function awardsSlideCount(recap: Recap): number {
  return buildSlides(recap).length;
}

export function AwardsShow({ recap, recapText, qrSrc, speed = 1, slideIndex, onSlideChange, paused, t = makeT(detectLang()) }: AwardsShowProps) {
  // Not memoized on `recap`: the room sends a fresh copy with every state, and the timers must not restart.
  const slides = buildSlides(recap);

  const [ownIndex, setOwnIndex] = useState(0);
  const index = slideIndex ?? ownIndex;
  const slide = slides[index % slides.length]!;
  useEffect(() => {
    // The last screen stays up until the TV is closed.
    if (paused || index % slides.length === slides.length - 1) return;
    const t = setTimeout(() => {
      const next = (index + 1) % slides.length;
      setOwnIndex(next);
      onSlideChange?.(next);
    }, slide.ms / speed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slide.ms, slides.length, speed, paused]);

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
              background: `hsl(${c.hue} 65% 70%)`,
              width: `${c.size}cqw`,
              height: `${c.size * 1.6}cqw`,
            }}
          />
        ))}
      </div>

      <div className="kt-tv-aw-stage" key={`${index}-${slide.kind}`}>
        {slide.kind === "intro" && <Intro recap={recap} t={t} />}
        {slide.kind === "credits" && <Credits recap={recap} t={t} speed={speed} paused={!!paused} />}
        {slide.kind === "finale" && <Closing recap={recap} recapText={recapText} qrSrc={qrSrc} t={t} speed={speed} paused={!!paused} />}
      </div>

      <div className="kt-tv-aw-dots" aria-hidden>
        {slides.map((_, i) => (
          <i key={i} className={i === index % slides.length ? "kt-tv-aw-on" : undefined} />
        ))}
      </div>
    </div>
  );
}

function Intro({ recap, t }: { recap: Recap; t: TFn }) {
  const songs = recap.performances.length;
  const singers = new Set(recap.performances.flatMap((p) => p.item.singerIds)).size;
  return (
    <div className="kt-tv-aw-center">
      <span className="kt-tv-aw-kicker">{t("story.wrap")}</span>
      <span className="kt-tv-aw-big">{t("tv.awardsGo")}</span>
      <span className="kt-tv-aw-sub">
        {songs === 0
          ? t("tv.came", { count: recap.members.length })
          : `${songs} ${t("unit.song", { count: songs })} · ${singers} ${t("unit.singer", { count: singers })} · ${recap.members.length} ${t("recap.atParty")}`}
      </span>
    </div>
  );
}

/** A person's titles, one per line. */
function TitleLines({ recap, id, t }: { recap: Recap; id: string; t: TFn }) {
  return (
    <>
      {(recap.titles[id] ?? []).slice(0, 3).map((tid) => (
        <span className="kt-tv-aw-title-line" key={tid}>
          {TITLE_INFO[tid].emoji} {titleName(t, tid)}
        </span>
      ))}
    </>
  );
}

/** One column of everyone that rolls up the screen at a steady pace, like the end credits of a film. */
function CreditsRoll({ recap, t, speed, paused, loop }: { recap: Recap; t: TFn; speed: number; paused: boolean; loop?: boolean }) {
  const people = recap.members;
  // With `loop`: once the credits have rolled off, wait a few seconds and roll them again (a new key restarts the animation).
  const [round, setRound] = useState(0);
  const again = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(again.current), []);
  return (
    <div className="kt-tv-aw-roll" data-layout="roll">
      <div
        key={round}
        className="kt-tv-aw-rolltrack"
        style={{ animationDuration: `${rollSeconds(people.length) / speed}s`, animationPlayState: paused ? "paused" : "running" }}
        onAnimationEnd={(e) => {
          if (!loop || e.target !== e.currentTarget) return;
          clearTimeout(again.current);
          again.current = setTimeout(() => setRound((r) => r + 1), CREDITS_AGAIN_MS / speed);
        }}
      >
        <span className="kt-tv-aw-kicker">{t("tv.cast")}</span>
        {people.map((m) => (
          <div className="kt-tv-aw-rollrow" key={m.id}>
            <img src={avatarUri(m.avatarSeed)} alt="" />
            <span className="kt-tv-aw-rollname">{m.nickname}</span>
            <span className="kt-tv-aw-rollrole">
              <TitleLines recap={recap} id={m.id} t={t} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Everyone who came. Few people: all on screen at once in a grid sized by their number.
 * Many: one column that rolls up the screen once.
 */
function Credits({ recap, t, speed, paused }: { recap: Recap; t: TFn; speed: number; paused: boolean }) {
  const people = recap.members;
  const n = people.length;
  if (n > CREDITS_FIT_MAX) {
    return (
      <div className="kt-tv-aw-credits kt-tv-aw-roll-wide">
        <CreditsRoll recap={recap} t={t} speed={speed} paused={paused} />
      </div>
    );
  }
  // Columns by count: 1-3 in a row, 4-6 as 3 columns, 7-8 as 4, up to 12 as 4 columns x 3 rows.
  const cols = n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return (
    <div className="kt-tv-aw-credits" data-layout="grid">
      <span className="kt-tv-aw-kicker">{t("tv.cast")}</span>
      <div className="kt-tv-aw-credgrid" style={{ ["--cols" as string]: cols, ["--rows" as string]: rows }}>
        {people.map((m, i) => (
          <div className="kt-tv-aw-credcell" key={m.id} style={{ animationDelay: `${i * 140}ms` }}>
            <img src={avatarUri(m.avatarSeed)} alt="" />
            <span className="kt-tv-aw-credname">{m.nickname}</span>
            <span className="kt-tv-aw-credrole">
              <TitleLines recap={recap} id={m.id} t={t} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The last screen, split in half: the thank-you and recap link on the left, the credits rolling on the right. */
function Closing({ recap, recapText, qrSrc, t, speed, paused }: { recap: Recap; recapText?: string; qrSrc?: string; t: TFn; speed: number; paused: boolean }) {
  if (recap.members.length === 0) return <Finale recap={recap} recapText={recapText} qrSrc={qrSrc} t={t} />;
  return (
    <div className="kt-tv-aw-split">
      <div className="kt-tv-aw-half">
        <Finale recap={recap} recapText={recapText} qrSrc={qrSrc} t={t} />
      </div>
      <div className="kt-tv-aw-half">
        <CreditsRoll recap={recap} t={t} speed={speed} paused={paused} loop />
      </div>
    </div>
  );
}

function Finale({ recap, recapText, qrSrc, t }: { recap: Recap; recapText?: string; qrSrc?: string; t: TFn }) {
  return (
    <div className="kt-tv-aw-center">
      <span className="kt-tv-aw-kicker">{t("tv.thanks")}</span>
      <span className="kt-tv-aw-big">{t("tv.seeYou")}</span>
      <div className="kt-tv-aw-faces" aria-hidden style={{ ["--cols" as string]: Math.min(recap.members.length, 8) <= 4 ? Math.min(recap.members.length, 8) : Math.ceil(Math.min(recap.members.length, 8) / 2) }}>
        {recap.members.slice(0, 8).map((m, i) => (
          <img key={m.id} src={avatarUri(m.avatarSeed)} alt="" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      {(qrSrc || recapText) && (
        <div className="kt-tv-aw-recap">
          {qrSrc && <img src={qrSrc} alt="" />}
          <span>
            {t("tv.yourRecap")}
            {recapText && <b>{recapText}</b>}
          </span>
        </div>
      )}
    </div>
  );
}
