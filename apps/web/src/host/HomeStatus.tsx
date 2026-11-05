import { Lock, LockOpen, QrCode, SkipForward, Tv } from "lucide-react";
import { formatRoomCode } from "@karaoke-tube/shared";
import { Button, IconButton, SongArt, singerNames, songParts, useRoom, useT, useToast } from "@karaoke-tube/ui";
import { openTvScreen } from "./client";
import { isPhoneLayout } from "./phone";
import css from "./host.module.css";

/** Host Home, top: the party at a glance (code, TV, guests, lock) and what is playing / coming up. */
export function HomeStatus() {
  return (
    <div className={css.homeStatus}>
      <PartyCard />
      <NowNext />
    </div>
  );
}

function PartyCard() {
  const { state, send } = useRoom();
  const t = useT();
  const toast = useToast();
  if (!state) return null;
  const guests = state.members.filter((m) => m.role !== "host").length;
  const locked = state.settings.locked;
  const tvOn = state.playerConnected;
  return (
    <section className={css.partyCard} aria-label={t("home.partyLabel")} data-testid="home-party">
      <div className={css.partyCode}>
        <span className={css.partyCodeLabel}>{t("home.joinWith")}</span>
        <b data-testid="home-code">{formatRoomCode(state.code)}</b>
      </div>
      <div className={css.partyFacts}>
        <span className={css.fact}>
          <i className={`${css.dot} ${tvOn ? css.dotOn : css.dotOff}`} aria-hidden />
          {tvOn ? t("home.tvOn") : t("home.tvOff")}
        </span>
        <span className={css.fact}>{t("home.guestCount", { n: guests })}</span>
      </div>
      <div className={css.partyActions}>
        {tvOn ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<QrCode size={16} />}
            onClick={() => {
              send({ type: "show_join" });
              toast.show(t("host.showCodeToast"));
            }}
          >
            {t("host.showCode")}
          </Button>
        ) : isPhoneLayout() ? null : (
          <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => !openTvScreen(state.code) && toast.show(t("host.tvPopup"), { tone: "error" })}>
            {t("host.openTv")}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={locked ? <Lock size={16} /> : <LockOpen size={16} />}
          onClick={() => {
            send({ type: "update_settings", settings: { locked: !locked } });
            toast.show(locked ? t("host.unlocked") : t("host.lockedToast"));
          }}
        >
          {locked ? t("host.unlockShort") : t("host.lockShort")}
        </Button>
      </div>
    </section>
  );
}

function NowNext() {
  const { state, send } = useRoom();
  const t = useT();
  if (!state) return null;
  const now = state.nowPlaying;
  const next = state.upNext.slice(0, 2);
  return (
    <section className={css.nowNext} aria-label={t("queue.nowSinging")} data-testid="home-now">
      {now ? (
        <div className={css.nowRow}>
          <SongArt song={now.song} size={56} radius="sm" explicit={now.song.explicit} />
          <div className={css.nowText}>
            <span className={css.kicker}>{t("queue.nowSinging")}</span>
            <b className={css.nowTitle}>{songParts(now.song).title}</b>
            <span className={css.nowSub}>🎤 {singerNames(now, state.members, t)}</span>
          </div>
          <IconButton label={t("player.skip")} onClick={() => send({ type: "skip" })}>
            <SkipForward size={22} fill="currentColor" />
          </IconButton>
        </div>
      ) : (
        <div className={css.nowText}>
          <b className={css.nowTitle}>{t("queue.empty")}</b>
          <span className={css.nowSub}>{t("queue.emptyHint")}</span>
        </div>
      )}
      {now && (
        <ul className={css.nextList} aria-label={t("queue.nextUp")}>
          {next.length === 0 ? (
            <li className={css.nextEmpty}>{t("queue.nothingNext")}</li>
          ) : (
            next.map((it) => (
              <li key={it.id}>
                <span className={css.kicker}>{t("queue.nextUp")}</span> {songParts(it.song).title} · {singerNames(it, state.members, t)}
              </li>
            ))
          )}
          {state.upNext.length > next.length && <li className={css.nextEmpty}>{t("home.moreInQueue", { n: state.upNext.length - next.length })}</li>}
        </ul>
      )}
    </section>
  );
}
