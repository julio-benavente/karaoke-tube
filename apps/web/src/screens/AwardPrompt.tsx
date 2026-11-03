import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { AWARDS, AWARD_INFO, type Award } from "@karaoke-tube/shared";
import { Avatar, singerLabel, songParts, useCountdown, useRoom } from "@karaoke-tube/ui";
import css from "./Alerts.module.css";

/**
 * C3: after a song ends, members who didn't sing it can give one award (Nailed it, Great vibes…).
 * A card above the tabs, not a blocking sheet. Gone once you gave one, dismissed it, or the window closes.
 */
export function AwardPrompt() {
  const { state, me, send } = useRoom();
  const win = state?.awardWindow ?? null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [sent, setSent] = useState<{ itemId: string; award: Award } | null>(null);
  const secondsLeft = useCountdown(win?.closesAt);

  // "Thanks" stays for a moment after giving, even though the room already counts it.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 2200);
    return () => clearTimeout(t);
  }, [sent]);

  if (!state || !me || !win || !state.settings.awards) return null;
  const { item } = win;
  const eligible = !item.singerIds.includes(me.id) && !win.givenBy.includes(me.id) && secondsLeft > 0;

  if (sent && sent.itemId === item.id) {
    const info = AWARD_INFO[sent.award];
    return (
      <div className={css.awardWrap}>
        <div className={css.award} role="status">
          <span className={css.thanks}>
            {info.emoji} {info.label} sent. Thanks for cheering!
          </span>
        </div>
      </div>
    );
  }
  if (!eligible || dismissed === item.id) return null;

  const singer = state.members.find((m) => m.id === item.singerIds[0]);
  const who = singerLabel(item, state.members);
  return (
    <div className={css.awardWrap}>
      <section className={css.award} aria-label="Give an award" data-testid="award-prompt">
        <header className={css.awardHead}>
          {singer && !item.everyone && <Avatar seed={singer.avatarSeed} size={32} />}
          <div className={css.awardTitle}>
            <span className={css.awardLine}>
              <b>{who}</b> just sang <b>{songParts(item.song).title}</b>
            </span>
            <span className={css.awardSub}>Give an award · {secondsLeft}s</span>
          </div>
          <button type="button" className={css.close} onClick={() => setDismissed(item.id)} aria-label="Not now">
            <X size={18} />
          </button>
        </header>
        <div className={css.awardButtons} role="group" aria-label="Awards">
          {AWARDS.map((a) => (
            <button
              key={a}
              type="button"
              className={css.awardBtn}
              onClick={() => {
                send({ type: "give_award", itemId: item.id, award: a });
                setSent({ itemId: item.id, award: a });
              }}
            >
              <span className={css.awardEmoji} aria-hidden>
                {AWARD_INFO[a].emoji}
              </span>
              <span>{AWARD_INFO[a].label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
