import { CircleSlash, Lock, LockOpen, Tv, Power, Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { AWARDS, AWARD_INFO, REACTION_EMOJI, normalizeRoomCode } from "@karaoke-tube/shared";
import {
  Button,
  EmptyState,
  IconButton,
  Logo,
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
import { adoptHostLink, createHostClients, hasCredentials, openTvScreen } from "./client";
import { Sidebar } from "./Sidebar";
import { QueuePanel } from "./QueuePanel";
import { HomeView } from "./HomeView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import css from "./host.module.css";

export type View = "home" | "search" | "settings";

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
