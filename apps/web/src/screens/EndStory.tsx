import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TITLE_INFO, type Recap } from "@karaoke-tube/shared";
import { Avatar, Button, songParts } from "@karaoke-tube/ui";
import { RecapView, ShareRecapButton } from "./RecapView";
import { cheersOf, songsOf } from "./recap";
import css from "./EndStory.module.css";

const STEP_MS = 4800;
const BACKGROUNDS = [
  "linear-gradient(160deg, #ff4f8b 0%, #7a1d52 55%, #070609 100%)",
  "linear-gradient(160deg, #8d67ab 0%, #3b2457 55%, #070609 100%)",
  "linear-gradient(160deg, #ffb547 0%, #a2331c 55%, #070609 100%)",
  "linear-gradient(160deg, #509bf5 0%, #1e3264 55%, #070609 100%)",
];

type Step = { key: string; bg: string; body: ReactNode };

/**
 * The end of a party on a phone: a tap-through story of your titles (like a yearly wrap-up),
 * then everyone's titles with a "Share recap" button. Without titles it goes straight to the recap.
 */
export function EndStory({ recap, meId, onDone }: { recap: Recap; meId?: string; onDone: () => void }) {
  const me = recap.members.find((m) => m.id === meId);
  const myTitles = (meId && recap.titles[meId]) || [];
  const mine = me ? songsOf(recap, me.id) : [];
  const myCheers = me ? cheersOf(recap, me.id) : 0;
  const best = mine.reduce<(typeof mine)[number] | null>((b, p) => (p.cheers > (b?.cheers ?? 0) ? p : b), null);

  const steps: Step[] = [];
  if (me && myTitles.length > 0) {
    steps.push({
      key: "intro",
      bg: BACKGROUNDS[0]!,
      body: (
        <>
          <Avatar seed={me.avatarSeed} size={132} ring className={css.pop} />
          <span className={css.kicker}>That's a wrap</span>
          <h1 className={css.big}>{me.nickname}, you were part of something good</h1>
          <p className={css.sub}>
            {mine.length > 0
              ? `You sang ${mine.length} ${mine.length === 1 ? "song" : "songs"} and got ${myCheers} ${myCheers === 1 ? "cheer" : "cheers"}.`
              : "You kept the room going all night."}
          </p>
        </>
      ),
    });
    myTitles.forEach((t, i) =>
      steps.push({
        key: t,
        bg: BACKGROUNDS[(i + 1) % BACKGROUNDS.length]!,
        body: (
          <>
            <span className={css.kicker}>Your title</span>
            <span className={`${css.emoji} ${css.pop}`} aria-hidden>
              {TITLE_INFO[t].emoji}
            </span>
            <h1 className={css.big}>{TITLE_INFO[t].name}</h1>
            <p className={css.sub}>{TITLE_INFO[t].description}</p>
          </>
        ),
      }),
    );
    if (best && best.cheers > 0) {
      steps.push({
        key: "best",
        bg: BACKGROUNDS[2]!,
        body: (
          <>
            <span className={css.kicker}>Your best moment</span>
            <span className={`${css.emoji} ${css.pop}`} aria-hidden>
              🙌
            </span>
            <h1 className={css.big}>{songParts(best.item.song).title}</h1>
            <p className={css.sub}>
              {best.cheers} {best.cheers === 1 ? "cheer" : "cheers"} from the room
            </p>
          </>
        ),
      });
    }
  }

  const [step, setStep] = useState(0);
  const last = steps.length; // one past the story: the summary
  useEffect(() => {
    if (step >= last) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, last]);

  if (step >= last) {
    return (
      <div className={css.summary}>
        <div className={css.summaryScroll}>
          <RecapView recap={recap} meId={meId} />
        </div>
        <div className={css.actions}>
          <ShareRecapButton recap={recap} />
          <Button size="lg" variant="secondary" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const current = steps[step]!;
  return (
    <div className={css.story} style={{ background: current.bg }}>
      <div className={css.bars} aria-hidden>
        {steps.map((s, i) => (
          <span key={s.key} className={css.bar}>
            <i className={i < step ? css.full : i === step ? css.running : undefined} style={{ animationDuration: `${STEP_MS}ms` }} />
          </span>
        ))}
      </div>
      <button type="button" className={css.skip} onClick={() => setStep(last)} aria-label="Skip to the recap">
        <X size={22} />
      </button>
      <div className={css.slide} key={current.key}>
        {current.body}
      </div>
      <button type="button" className={css.back} onClick={() => setStep((s) => Math.max(0, s - 1))} aria-label="Previous" />
      <button type="button" className={css.next} onClick={() => setStep((s) => s + 1)} aria-label="Next" />
    </div>
  );
}
