import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { TITLE_INFO, type Recap } from "@karaoke-tube/shared";
import { Artwork, Avatar, Button, songParts } from "@karaoke-tube/ui";
import { cheersOf, shareRecap, singerCount, songsOf, type ShareResult } from "./recap";
import css from "./RecapView.module.css";

/** The recap card: what happened, the moment of the night, everyone's titles, the songs. Used by the page and the end of a party. */
export function RecapView({ recap, meId }: { recap: Recap; meId?: string }) {
  const songs = recap.performances.length;
  const nameOf = (id: string) => recap.members.find((m) => m.id === id)?.nickname ?? "Someone";
  const hasTitles = Object.values(recap.titles).some((t) => t.length > 0);
  const moment = recap.topMoment && recap.topMoment.cheers > 0 ? recap.topMoment : null;
  const date = new Date(recap.endedAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className={css.view}>
      <header className={css.head}>
        <span className={css.kicker}>Karaoke night</span>
        <h1 className={css.title}>What a night</h1>
        <p className={css.date}>{date}</p>
        <div className={css.stats}>
          <Stat n={songs} label={songs === 1 ? "song" : "songs"} />
          <Stat n={singerCount(recap)} label={singerCount(recap) === 1 ? "singer" : "singers"} />
          <Stat n={recap.members.length} label="at the party" />
          <Stat n={recap.performances.reduce((n, p) => n + p.cheers, 0)} label="cheers" />
        </div>
      </header>

      {moment && (
        <section className={css.moment}>
          <span className={css.sectionLabel}>Most-cheered moment</span>
          <div className={css.momentRow}>
            <Artwork src={moment.item.song.thumbnailUrl} label={moment.item.song.videoId} size={72} radius="sm" shadow />
            <div className={css.momentText}>
              <b>{songParts(moment.item.song).title}</b>
              <span>
                {songParts(moment.item.song).artist} · {moment.item.singerIds.map(nameOf).join(" & ")}
              </span>
              <em>🙌 {moment.cheers} cheers</em>
            </div>
          </div>
        </section>
      )}

      {hasTitles && (
        <section>
          <span className={css.sectionLabel}>The titles</span>
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
                      {m.id === meId && <small> · you</small>}
                    </b>
                    <span className={css.chips}>
                      {titles.map((t) => (
                        <span key={t} className={css.chip} title={TITLE_INFO[t].description}>
                          {TITLE_INFO[t].emoji} {TITLE_INFO[t].name}
                        </span>
                      ))}
                    </span>
                    <small className={css.sung}>
                      {songsOf(recap, m.id).length} {songsOf(recap, m.id).length === 1 ? "song" : "songs"} · {cheersOf(recap, m.id)} cheers
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
          <span className={css.sectionLabel}>The setlist</span>
          <ol className={css.setlist}>
            {recap.performances.map((p) => (
              <li key={p.item.id}>
                <span className={css.num} aria-hidden />
                <span className={css.songText}>
                  <b>{songParts(p.item.song).title}</b>
                  <span>{p.item.everyone ? "Everyone" : p.item.singerIds.map(nameOf).join(" & ")}</span>
                </span>
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
  const [result, setResult] = useState<ShareResult | null>(null);
  const run = async () => {
    const r = await shareRecap(recap);
    setResult(r);
    setTimeout(() => setResult(null), 2500);
  };
  return (
    <Button variant={variant} size="lg" icon={result === "copied" ? <Check size={18} /> : <Share2 size={18} />} onClick={run}>
      {result === "copied" ? "Link copied" : result === "failed" ? "Couldn't share" : "Share recap"}
    </Button>
  );
}
