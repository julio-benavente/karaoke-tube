import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { TITLE_INFO, type QueueItem, type Recap } from "@karaoke-tube/shared";
import { Avatar, SongArt, AvatarStack, Button, songParts, titleDesc, titleName, useLang, useT, type TFn } from "@karaoke-tube/ui";
import { cheersOf, shareRecap, singerCount, songsOf, type ShareResult } from "./recap";
import css from "./RecapView.module.css";

/** The recap card: what happened, the moment of the night, everyone's titles, the songs. Used by the page and the end of a party. */
export function RecapView({ recap, meId }: { recap: Recap; meId?: string }) {
  const t = useT();
  const [lang] = useLang();
  const songs = recap.performances.length;
  const nameOf = (id: string) => recap.members.find((m) => m.id === id)?.nickname ?? t("singer.someone");
  /** The avatars of everyone who sang a song: both singers of a duet (nothing for a sing-along). */
  const seedsOf = (item: QueueItem) => (item.everyone ? [] : item.singerIds.flatMap((id) => recap.members.find((m) => m.id === id)?.avatarSeed ?? []));
  const totalCheers = recap.performances.reduce((n, p) => n + p.cheers, 0);
  const hasTitles = Object.values(recap.titles).some((t) => t.length > 0);
  const moment = recap.topMoment && recap.topMoment.cheers > 0 ? recap.topMoment : null;
  const date = new Date(recap.endedAt).toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className={css.view}>
      <header className={css.head}>
        <span className={css.kicker}>{t("recap.kicker")}</span>
        <h1 className={css.title}>{t("recap.title")}</h1>
        <p className={css.date}>{date}</p>
        <div className={css.stats}>
          <Stat n={songs} label={t("unit.song", { count: songs })} />
          <Stat n={singerCount(recap)} label={t("unit.singer", { count: singerCount(recap) })} />
          <Stat n={recap.members.length} label={t("recap.atParty")} />
          <Stat n={totalCheers} label={t("unit.cheer", { count: totalCheers })} />
        </div>
      </header>

      {moment && (
        <section className={css.moment}>
          <span className={css.sectionLabel}>{t("recap.moment")}</span>
          <div className={css.momentRow}>
            <SongArt song={moment.item.song} size={72} radius="sm" shadow explicit={moment.item.song.explicit} />
            <div className={css.momentText}>
              <b>{songParts(moment.item.song).title}</b>
              <span>
                {songParts(moment.item.song).artist} · {moment.item.singerIds.map(nameOf).join(` ${t("singer.and")} `)}
              </span>
              <em>🙌 {t("recap.cheersCount", { count: moment.cheers })}</em>
            </div>
            <AvatarStack seeds={seedsOf(moment.item)} size={36} />
          </div>
        </section>
      )}

      {hasTitles && (
        <section>
          <span className={css.sectionLabel}>{t("recap.titles")}</span>
          <ul className={css.people}>
            {recap.members.map((m) => {
              const titles = recap.titles[m.id] ?? [];
              if (titles.length === 0) return null;
              return (
                <li key={m.id} className={m.id === meId ? `${css.person} ${css.me}` : css.person}>
                  <Avatar seed={m.avatarSeed} size={44} />
                  <div className={css.personBody}>
                    <b>
                      {m.nickname}
                      {m.id === meId && <small> · {t("recap.you")}</small>}
                    </b>
                    <span className={css.chips}>
                      {titles.map((id) => (
                        <span key={id} className={css.chip} title={titleDesc(t, id)}>
                          {TITLE_INFO[id].emoji} {titleName(t, id)}
                        </span>
                      ))}
                    </span>
                    <small className={css.sung}>
                      {songsOf(recap, m.id).length} {t("unit.song", { count: songsOf(recap, m.id).length })} · {cheersOf(recap, m.id)} {t("unit.cheer", { count: cheersOf(recap, m.id) })}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {songs > 0 && (
        <section>
          <span className={css.sectionLabel}>{t("recap.setlist")}</span>
          <ol className={css.setlist}>
            {recap.performances.map((p) => (
              <li key={p.item.id}>
                <span className={css.num} aria-hidden />
                <span className={css.songText}>
                  <b>{songParts(p.item.song).title}</b>
                  <span>{p.item.everyone ? t("singer.everyone") : p.item.singerIds.map(nameOf).join(` ${t("singer.and")} `)}</span>
                </span>
                <AvatarStack seeds={seedsOf(p.item)} size={28} />
                <span className={css.cheers}>🙌 {p.cheers}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className={css.stat}>
      <b>{n}</b>
      {label}
    </span>
  );
}

/** "Share recap": the phone's share sheet, or copy the link. */
export function ShareRecapButton({ recap, variant = "primary" }: { recap: Recap; variant?: "primary" | "light" | "secondary" }) {
  const t = useT();
  const [result, setResult] = useState<ShareResult | null>(null);
  const run = async () => {
    const r = await shareRecap(recap, t);
    setResult(r);
    setTimeout(() => setResult(null), 2500);
  };
  return (
    <Button variant={variant} size="lg" icon={result === "copied" ? <Check size={18} /> : <Share2 size={18} />} onClick={run}>
      {result === "copied" ? t("party.copied") : result === "failed" ? t("share.failed") : t("share.recap")}
    </Button>
  );
}
