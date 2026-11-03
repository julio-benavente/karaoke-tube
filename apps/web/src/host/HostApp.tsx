import { CircleSlash, Home, ListMusic, Lock, LockOpen, PartyPopper, Search as SearchIcon, Settings as SettingsIcon, Tv, Power, Flame, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AWARDS, AWARD_INFO, REACTION_EMOJI, normalizeRoomCode } from "@karaoke-tube/shared";
import {
  BottomTabs,
  Button,
  EmptyState,
  IconButton,
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
  useToast,
} from "@karaoke-tube/ui";
import { useParams } from "react-router";
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
  const code = normalizeRoomCode(useParams().code ?? "");
  const isMock = new URLSearchParams(location.search).get("mock") === "1";
  // Before creating the client: it rejoins with the saved host credentials.
  const allowed = useMemo(() => {
    adoptHostLink(code);
    return isMock || hasCredentials(code);
  }, [code, isMock]);
  const clients = useMemo(() => (allowed ? createHostClients(code) : null), [allowed, code]);
  if (!clients) {
    return (
      <div className={css.center}>
        <EmptyState icon={<CircleSlash />} title="No party saved on this device" action={<Button onClick={() => (location.href = "/host/new")}>Host a party</Button>}>
          Start a party from this browser, or open the host link you started it with. Joining as a guest?{" "}
          <a href={`/join/${code}`}>Join {code}</a>.
        </EmptyState>
      </div>
    );
  }
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

function Host() {
  const { state, me, status, closeReason, send } = useRoom();
  const toast = useToast();
  const [view, setView] = useState<View>("home");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
  const mobile = useIsMobile();

  useRoomErrors((e) => toast.show(errorText(e.code), { tone: "error" }));

  if (state?.status === "ended" || closeReason === "ended") {
    return (
      <div className={css.center}>
        <EmptyState icon={<Power />} title="The party has ended" action={<Button onClick={() => (location.href = "/host/new")}>Start a new party</Button>}>
          Thanks for hosting! Want another round? Start a new party anytime.
        </EmptyState>
      </div>
    );
  }
  if (status === "closed") {
    return (
      <div className={css.center}>
        <EmptyState
          icon={<CircleSlash />}
          title="Can't reach this party"
          action={
            <>
              <Button onClick={() => location.reload()}>Try again</Button>
              <Button variant="secondary" onClick={() => (location.href = "/")}>
                Done
              </Button>
            </>
          }
        >
          The party may have ended or been removed. If it's still running, check your connection and try again.
        </EmptyState>
      </div>
    );
  }
  if (me && me.role === "guest") {
    return (
      <div className={css.center}>
        <EmptyState icon={<CircleSlash />} title="This is the host's screen" action={<Button onClick={() => (location.href = `/r/${state?.code ?? ""}`)}>Go to the party</Button>}>
          You're a guest in this party.
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
    <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} label="End party">
      <div className={css.confirm}>
        <h2 className={css.confirmTitle}>End the party?</h2>
        <p className={css.muted}>Everyone will be disconnected and the queue will be cleared. This can't be undone.</p>
        <div className={css.confirmButtons}>
          <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
            Keep singing
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmEnd(false);
              send({ type: "end_party" });
            }}
          >
            End party
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
        {status === "reconnecting" && <div className={css.reconnecting}>Reconnecting to the party…</div>}
        {status === "open" && state.playerConnected === false && (
          <div className={css.tvClosed} role="alert" data-testid="tv-banner">
            <span>No TV screen connected</span>
            <Button size="sm" variant="light" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code)}>
              Open TV
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
                  <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code)}>
                    Open TV screen
                  </Button>
                  {state.playerConnected && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<QrCode size={16} />}
                      onClick={() => {
                        send({ type: "show_join" });
                        toast.show("Showing the code on the TV for 15 seconds.");
                      }}
                    >
                      Show code on TV
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={locked ? <Lock size={16} /> : <LockOpen size={16} />}
                    onClick={() => {
                      send({ type: "update_settings", settings: { locked: !locked } });
                      toast.show(locked ? "Party unlocked. New guests can join." : "Party locked. No new guests can join.");
                    }}
                  >
                    {locked ? "Unlock party" : "Lock party"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Power size={16} />} onClick={() => setConfirmEnd(true)}>
                    End party
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
            { key: "home", label: "Home", icon: tabIcon("home", Home) },
            { key: "search", label: "Search", icon: tabIcon("search", SearchIcon) },
            { key: "queue", label: "Queue", icon: tabIcon("queue", ListMusic), badge: state.upNext.length || undefined },
            { key: "party", label: "Party", icon: tabIcon("party", PartyPopper), badge: state.pending?.length || undefined },
            { key: "settings", label: "Settings", icon: tabIcon("settings", SettingsIcon) },
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
      {status === "reconnecting" && <div className={css.reconnecting}>Reconnecting to the party…</div>}
      {status === "open" && state.playerConnected === false && (
        <div className={css.tvClosed} role="alert" data-testid="tv-banner">
          <span>
            No TV screen connected
            <span className={css.tvHint}> Open the TV screen, drag that window to the TV and press Start.</span>
          </span>
          <Button size="sm" variant="light" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code)}>
            Open TV screen
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
                label={locked ? "Unlock party (let new guests join)" : "Lock party (no new guests)"}
                active={locked}
                onClick={() => {
                  send({ type: "update_settings", settings: { locked: !locked } });
                  toast.show(locked ? "Party unlocked. New guests can join." : "Party locked. No new guests can join.");
                }}
              >
                {locked ? <Lock size={18} /> : <LockOpen size={18} />}
              </IconButton>
              <IconButton label={queueOpen ? "Hide queue" : "Show queue"} active={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>
                <QueueIcon />
              </IconButton>
              {state.playerConnected && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<QrCode size={16} />}
                  onClick={() => {
                    send({ type: "show_join" });
                    toast.show("Showing the code on the TV for 15 seconds.");
                  }}
                >
                  Show code on TV
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => showOnTv(toast.show, state.code)}>
                Open TV screen
              </Button>
              <Button size="sm" variant="ghost" icon={<Power size={16} />} onClick={() => setConfirmEnd(true)}>
                End
              </Button>
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
  const [on, setOn] = useWatchPref();
  return (
    <div className={css.watchHere}>
      {on && <RemoteVideo item={item} playback={playback} />}
      <Button size="sm" variant="secondary" icon={<Tv size={16} />} onClick={() => setOn(!on)}>
        {on ? "Hide video" : "Watch here"}
      </Button>
    </div>
  );
}

function ReactionCount() {
  const { recent, total } = useReactions(1500);
  const last = recent[recent.length - 1];
  return (
    <span className={css.reactions} title="Reactions this session" aria-live="off">
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
  const win = state?.awardWindow ?? null;
  const left = useCountdown(win?.closesAt);
  if (!state || !win || !state.settings.awards || left <= 0) return null;
  const given = AWARDS.filter((a) => (win.counts[a] ?? 0) > 0);
  return (
    <span
      className={css.awards}
      title={`Awards for ${songParts(win.item.song).title}, open for ${left}s`}
      data-testid="award-counts"
      aria-live="polite"
    >
      <span className={css.awardsLabel}>Awards</span>
      {given.length === 0 ? (
        <span className={css.awardsIdle}>{left}s</span>
      ) : (
        given.map((a) => (
          <span key={a} className={css.awardCount} title={AWARD_INFO[a].label}>
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
function showOnTv(show: (m: string, o?: { tone: "error" }) => void, code: string) {
  if (!openTvScreen(code)) show("Couldn't open the TV screen. Allow pop-ups for this site and try again.", { tone: "error" });
}
