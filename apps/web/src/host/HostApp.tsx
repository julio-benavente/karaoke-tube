import { useLogParty } from "../account/AccountContext";
import { useLiveParties } from "../account/useLiveParties";
import { useRoleToast } from "../useRoleToast";
import { adoptLiveParty, markHosting } from "../session";
import { CircleSlash, Home, ListMusic, Lock, LockOpen, PartyPopper, Search as SearchIcon, Settings as SettingsIcon, Tv, Power, Flame, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AWARDS, AWARD_INFO, REACTION_EMOJI, normalizeRoomCode } from "@karaoke-tube/shared";
import {
  BottomTabs,
  Button,
  EmptyState,
  IconButton,
  LanguageSwitcher,
  Logo,
  MiniPlayer,
  PlayerBar,
  PlayerBarDivider,
  RoomProvider,
  Sheet,
  SingWithProvider,
  Spinner,
  ToastProvider,
  errorText,
  songParts,
  useCountdown,
  useReactions,
  useRoom,
  useRoomErrors,
  useT,
  useToast,
  awardLabel,
  type TFn,
} from "@karaoke-tube/ui";
import { useNavigate, useParams } from "react-router";
import { TurnAlertBanner } from "../screens/TurnAlert";
import { RemoteVideo } from "../watch/RemoteVideo";
import { useWatchPref } from "../watch/pref";
import { adoptHostLink, createHostClients, hasCredentials, openTvScreen } from "./client";
import { Sidebar } from "./Sidebar";
import { QueuePanel } from "./QueuePanel";
import { HomeView } from "./HomeView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import css from "./host.module.css";

export type View = "home" | "search" | "settings" | "queue" | "party";
const VIEWS = ["search", "settings", "queue", "party"] as const;

/** Phones and narrow windows get the phone layout: one column, tabs at the bottom. */
const MOBILE_QUERY = "(max-width: 820px)";
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** H1: the host app, full tab. Sidebar | main | queue, player bar at the bottom. */
export function HostApp() {
  const t = useT();
  const code = normalizeRoomCode(useParams().code ?? "");
  const isMock = new URLSearchParams(location.search).get("mock") === "1";
  // Before creating the client: it rejoins with the saved host credentials.
  const [restored, setRestored] = useState(0);
  const allowed = useMemo(() => {
    adoptHostLink(code);
    const ok = isMock || hasCredentials(code);
    if (ok && !isMock) markHosting(code, true);
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isMock, restored]);
  // No credentials on this device (new device, cleared browser)? A signed-in account can bring them back.
  const live = useLiveParties();
  const mine = live?.find((p) => p.code === code && p.role === "host");
  useEffect(() => {
    if (!allowed && mine) {
      adoptLiveParty(mine);
      setRestored((n) => n + 1);
    }
  }, [allowed, mine]);
  const clients = useMemo(() => (allowed ? createHostClients(code) : null), [allowed, code]);
  if (!clients && live === null && !isMock) {
    return (
      <div className={css.center}>
        <Spinner />
      </div>
    );
  }
  if (!clients) return <NoParty code={code} />;
  return (
    <RoomProvider client={clients.room} search={clients.search}>
      <ToastProvider offset={96}>
        <SingWithProvider>
          <Host />
        </SingWithProvider>
      </ToastProvider>
    </RoomProvider>
  );
}

/** This device holds no (valid) host credentials for the party. */
function NoParty({ code }: { code: string }) {
  const t = useT();
  return (
    <div className={css.center}>
      <EmptyState icon={<CircleSlash />} title={t("host.noParty")} action={<Button onClick={() => (location.href = "/host/new")}>{t("host.hostParty")}</Button>}>
        {t("host.noPartyHint")}{" "}
        <a href={`/join/${code}`}>{t("host.joinCode", { code })}</a>.
      </EmptyState>
    </div>
  );
}

function Host() {
  const routeCode = normalizeRoomCode(useParams().code ?? "");
  const { state, me, status, closeReason, send } = useRoom();
  useLogParty(state?.code ?? "", !!me && !!state, state?.status === "ended");
  const toast = useToast();
  const t = useT();
  // The tab is part of the address (/host/<code>/search…), so refresh, Back and shared links keep it.
  const navigate = useNavigate();
  const segment = useParams()["*"] ?? "";
  const view: View = (VIEWS as readonly string[]).includes(segment) ? (segment as View) : "home";
  const setView = (v: View) => navigate(`/host/${routeCode}${v === "home" ? "" : `/${v}`}`);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
  const mobile = useIsMobile();

  useRoomErrors((e) => toast.show(errorText(e.code), { tone: "error" }));
  useRoleToast();

  if (closeReason === "forgotten") {
    markHosting(routeCode, false);
    return <NoParty code={routeCode} />;
  }
  if (state?.status === "ended" || closeReason === "ended") {
    return (
      <div className={css.center}>
        <EmptyState icon={<Power />} title={t("host.ended")} action={<Button onClick={() => (location.href = "/host/new")}>{t("host.startNew")}</Button>}>
          {t("host.endedHint")}
        </EmptyState>
      </div>
    );
  }
  if (status === "closed") {
    return (
      <div className={css.center}>
        <EmptyState
          icon={<CircleSlash />}
          title={t("host.cantReach")}
          action={
            <>
              <Button onClick={() => location.reload()}>{t("common.tryAgain")}</Button>
              <Button variant="secondary" onClick={() => (location.href = "/")}>
                {t("common.done")}
              </Button>
            </>
          }
        >
          {t("host.cantReachHint")}
        </EmptyState>
      </div>
    );
  }
  if (me && me.role === "guest") {
    return (
      <div className={css.center}>
        <EmptyState icon={<CircleSlash />} title={t("host.hostScreen")} action={<Button onClick={() => (location.href = `/r/${state?.code ?? ""}`)}>{t("host.goToParty")}</Button>}>
          {t("host.youAreGuest")}
        </EmptyState>
      </div>
    );
  }
  if (!state || !me) {
    return (
      <div className={css.center}>
        <Logo size={40} />
        <Spinner />
      </div>
    );
  }

  const locked = state.settings.locked;

  const endSheet = (
    <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} label={t("host.endLabel")}>
      <div className={css.confirm}>
        <h2 className={css.confirmTitle}>{t("host.endTitle")}</h2>
        <p className={css.muted}>{t("host.endText")}</p>
        <div className={css.confirmButtons}>
          <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
            {t("host.keepSinging")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmEnd(false);
              send({ type: "end_party" });
            }}
          >
            {t("host.endLabel")}
          </Button>
        </div>
      </div>
    </Sheet>
  );

  if (mobile) {
    const tab = view;
    const tabIcon = (v: View, Icon: typeof Home) => <Icon strokeWidth={tab === v ? 2.6 : 2} />;
    const playing = state.playback.state === "playing";
    return (
      <div className={css.mobileFrame}>
        {status === "reconnecting" && <div className={css.reconnecting}>{t("host.reconnecting")}</div>}
        {status === "open" && state.playerConnected === false && (
          <div className={css.tvClosed} role="alert" data-testid="tv-banner">
            <span>{state.screenPaired ? t("host.tvOffline") : t("host.noTv")}</span>
            <Button size="sm" variant="light" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code, t)}>
              {t("host.openTv")}
            </Button>
          </div>
        )}
        <main className={css.mobileMain}>
          {view === "home" && <HomeView onSearch={() => setView("search")} />}
          {view === "search" && <SearchView />}
          {view === "queue" && (
            <>
              {state.nowPlaying && <WatchHere item={state.nowPlaying} playback={state.playback} />}
              <QueuePanel />
            </>
          )}
          {view === "party" && (
            <Sidebar
              view={view}
              onView={setView}
              only="party"
              actions={
                <div className={css.mobileActions}>
                  <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code, t)}>
                    {t("host.openTv")}
                  </Button>
                  {state.playerConnected && (
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
                  <Button size="sm" variant="ghost" icon={<Power size={16} />} onClick={() => setConfirmEnd(true)}>
                    {t("host.endLabel")}
                  </Button>
                </div>
              }
            />
          )}
          {view === "settings" && <SettingsView />}
        </main>
        <BottomTabs
          active={tab}
          onSelect={(k) => setView(k as View)}
          tabs={[
            { key: "home", label: t("tab.home"), icon: tabIcon("home", Home) },
            { key: "search", label: t("tab.search"), icon: tabIcon("search", SearchIcon) },
            { key: "queue", label: t("tab.queue"), icon: tabIcon("queue", ListMusic), badge: state.upNext.length || undefined },
            { key: "party", label: t("tab.party"), icon: tabIcon("party", PartyPopper), badge: state.pending?.length || undefined },
            { key: "settings", label: t("nav.settings"), icon: tabIcon("settings", SettingsIcon) },
          ]}
        >
          {state.nowPlaying && (
            <MiniPlayer
              item={state.nowPlaying}
              playback={state.playback}
              members={state.members}
              onOpen={() => setView("queue")}
              onToggle={() => send({ type: playing ? "pause" : "resume" })}
            />
          )}
        </BottomTabs>
        {endSheet}
        <TurnAlertBanner />
      </div>
    );
  }

  return (
    <div className={`${css.frame} ${queueOpen ? "" : css.noQueue}`}>
      {status === "reconnecting" && <div className={css.reconnecting}>{t("host.reconnecting")}</div>}
      {status === "open" && state.playerConnected === false && (
        <div className={css.tvClosed} role="alert" data-testid="tv-banner">
          <span>
            {state.screenPaired ? t("host.tvOffline") : t("host.noTv")}
            <span className={css.tvHint}> {state.screenPaired ? t("host.tvOfflineHint") : t("host.noTvHint")}</span>
          </span>
          <Button size="sm" variant="light" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code, t)}>
            {t("host.openTv")}
          </Button>
        </div>
      )}
      <Sidebar view={view} onView={setView} />
      <main className={css.main}>
        {view === "home" && <HomeView onSearch={() => setView("search")} />}
        {view === "search" && <SearchView />}
        {view === "settings" && <SettingsView />}
      </main>
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      <div className={css.player}>
        <PlayerBar
          item={state.nowPlaying}
          playback={state.playback}
          members={state.members}
          onPause={() => send({ type: "pause" })}
          onResume={() => send({ type: "resume" })}
          onSkip={() => send({ type: "skip" })}
          onRestart={() => send({ type: "restart" })}
          right={
            <>
              <AwardCounts />
              <ReactionCount />
              <PlayerBarDivider />
              <IconButton
                label={locked ? t("host.unlock") : t("host.lock")}
                active={locked}
                onClick={() => {
                  send({ type: "update_settings", settings: { locked: !locked } });
                  toast.show(locked ? t("host.unlocked") : t("host.lockedToast"));
                }}
              >
                {locked ? <Lock size={18} /> : <LockOpen size={18} />}
              </IconButton>
              <IconButton label={queueOpen ? t("host.hideQueue") : t("host.showQueue")} active={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>
                <QueueIcon />
              </IconButton>
              {state.playerConnected && (
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
              )}
              <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code, t)}>
                {t("host.openTv")}
              </Button>
              <Button size="sm" variant="ghost" icon={<Power size={16} />} onClick={() => setConfirmEnd(true)}>
                {t("host.end")}
              </Button>
              <LanguageSwitcher />
            </>
          }
        />
      </div>

      {endSheet}
      <TurnAlertBanner />
    </div>
  );
}

/** Host on a phone, away from the TV: the karaoke video here, in step with the room. */
function WatchHere({ item, playback }: { item: NonNullable<ReturnType<typeof useRoom>["state"]>["nowPlaying"] & {}; playback: Parameters<typeof RemoteVideo>[0]["playback"] }) {
  const t = useT();
  const [on, setOn] = useWatchPref();
  return (
    <div className={css.watchHere}>
      {on && <RemoteVideo item={item} playback={playback} />}
      <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => setOn(!on)}>
        {on ? t("watch.hide") : t("watch.on")}
      </Button>
    </div>
  );
}

function ReactionCount() {
  const t = useT();
  const { recent, total } = useReactions(1500);
  const last = recent[recent.length - 1];
  return (
    <span className={css.reactions} title={t("host.reactionsSession")} aria-live="off">
      <span key={last?.id} className={css.reactionPop}>
        {last ? REACTION_EMOJI[last.reaction] : <Flame size={16} />}
      </span>
      <span className={css.reactionNum}>{total}</span>
    </span>
  );
}

/** C3: award counts for the song that just ended, while members can still give them. */
function AwardCounts() {
  const { state } = useRoom();
  const t = useT();
  const win = state?.awardWindow ?? null;
  const left = useCountdown(win?.closesAt);
  if (!state || !win || !state.settings.awards || left <= 0) return null;
  const given = AWARDS.filter((a) => (win.counts[a] ?? 0) > 0);
  return (
    <span
      className={css.awards}
      title={t("host.awardsFor", { title: songParts(win.item.song).title, n: left })}
      data-testid="award-counts"
      aria-live="polite"
    >
      <span className={css.awardsLabel}>{t("host.awards")}</span>
      {given.length === 0 ? (
        <span className={css.awardsIdle}>{left}s</span>
      ) : (
        given.map((a) => (
          <span key={a} className={css.awardCount} title={awardLabel(t, a)}>
            {AWARD_INFO[a].emoji} {win.counts[a]}
          </span>
        ))
      )}
    </span>
  );
}

function QueueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 6h13M3 12h13M3 18h8" />
      <path d="M17 15v6l4-3z" fill="currentColor" />
    </svg>
  );
}

/** Opens the TV screen window; the party plays there. */
function showOnTv(show: (m: string, o?: { tone: "error" }) => void, code: string, t: TFn) {
  if (!openTvScreen(code)) show(t("host.tvPopup"), { tone: "error" });
}
