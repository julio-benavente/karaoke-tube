import { CircleSlash, Home, ListMusic, PartyPopper, Search, WifiOff } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  Banner,
  BottomTabs,
  Button,
  EmptyState,
  Logo,
  MiniPlayer,
  RoomProvider,
  SingWithProvider,
  Spinner,
  ToastProvider,
  errorText,
  useRoom,
  useRoomErrors,
  useToast,
  useT,
} from "@karaoke-tube/ui";
import { dropRoomClient, getRoomClient, getSearchApi, hasJoined, markJoined, normalizeCode } from "../session";
import { AwardPrompt } from "./AwardPrompt";
import { EndStory } from "./EndStory";
import { NowSingingSheet } from "./NowSinging";
import { TurnAlertBanner } from "./TurnAlert";
import css from "./RoomShell.module.css";

type ShellCtx = { openNowSinging: () => void; code: string; leave: () => void };
const ShellContext = createContext<ShellCtx | null>(null);
export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell outside RoomShell");
  return ctx;
}

/** /r/:code: connects to the room and frames the four tabs. */
export function RoomShell() {
  const params = useParams();
  const code = normalizeCode(params.code ?? "");
  const [attempt, setAttempt] = useState(0);
  const client = useMemo(
    () => (hasJoined(code) ? getRoomClient(code) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, attempt],
  );
  if (!client) return <Navigate to={`/join/${code}`} replace />;
  return (
    <RoomProvider client={client} search={getSearchApi()}>
      <ToastProvider offset={148}>
        <SingWithProvider>
          <Shell
            code={code}
            retry={() => {
              dropRoomClient(code);
              setAttempt((n) => n + 1);
            }}
          />
        </SingWithProvider>
      </ToastProvider>
    </RoomProvider>
  );
}

function Shell({ code, retry }: { code: string; retry: () => void }) {
  const t = useT();
  const { state, me, status, closeReason, isHost, send } = useRoom();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const toast = useToast();
  const nowOpen = search.get("now") === "1";

  useRoomErrors((e) => {
    if (e.code === "queue_limit") {
      const n = state?.settings.maxWaitingPerMember ?? 2;
      toast.show(t("search.limitToast", { count: n }), { tone: "error" });
    } else {
      toast.show(errorText(e.code), { tone: "error" });
    }
  });

  const openNowSinging = useCallback(() => {
    const next = new URLSearchParams(search);
    next.set("now", "1");
    setSearch(next);
  }, [search, setSearch]);
  const closeNowSinging = useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else {
      const next = new URLSearchParams(search);
      next.delete("now");
      setSearch(next, { replace: true });
    }
  }, [location.key, navigate, search, setSearch]);

  const leave = useCallback(() => {
    markJoined(code, false);
    dropRoomClient(code);
    navigate("/join", { replace: true });
  }, [code, navigate]);

  const ctx = useMemo(() => ({ openNowSinging, code, leave }), [openNowSinging, code, leave]);

  // ── end states ──
  if (closeReason === "kicked") {
    return (
      <EndScreen
        icon={<CircleSlash />}
        title="You were removed from the party"
        text="The host removed you. You can join again if they invite you back."
        action={<Button onClick={leave}>Back to start</Button>}
      />
    );
  }
  if (state?.status === "ended" || closeReason === "ended") {
    return state?.recap ? <EndStory recap={state.recap} meId={me?.id} onDone={leave} /> : <ThanksScreen onDone={leave} />;
  }
  if (status === "closed") {
    return (
      <EndScreen
        icon={<WifiOff />}
        title="Lost connection"
        text={`We couldn't stay connected to party ${code}.`}
        action={
          <>
            <Button onClick={retry}>Try again</Button>
            <Button variant="secondary" onClick={leave}>
              Join another party
            </Button>
          </>
        }
      />
    );
  }
  if (!state || !me) {
    return (
      <div className={css.splash}>
        <Logo size={40} />
        <Spinner />
        <p className={css.splashText}>Joining party {code}…</p>
      </div>
    );
  }

  const tab = location.pathname.endsWith("/search")
    ? "search"
    : location.pathname.endsWith("/queue")
      ? "queue"
      : location.pathname.endsWith("/party")
        ? "party"
        : "home";
  const mine = state.upNext.filter((q) => q.singerIds.includes(me.id)).length;

  return (
    <ShellContext.Provider value={ctx}>
      <div className={css.app}>
        {status === "reconnecting" && (
          <div className={css.reconnecting}>
            <Banner tone="warning" icon={<WifiOff />}>
              Reconnecting… your spot in the queue is safe.
            </Banner>
          </div>
        )}
        <main className={css.main}>
          <Outlet />
        </main>
        <BottomTabs
          active={tab}
          onSelect={(k) => navigate(k === "home" ? `/r/${code}` : `/r/${code}/${k}`)}
          tabs={[
            { key: "home", label: t("tab.home"), icon: <Home strokeWidth={tab === "home" ? 2.6 : 2} /> },
            { key: "search", label: t("tab.search"), icon: <Search strokeWidth={tab === "search" ? 2.8 : 2} /> },
            {
              key: "queue",
              label: t("tab.queue"),
              icon: <ListMusic strokeWidth={tab === "queue" ? 2.6 : 2} />,
              badge: mine || undefined,
            },
            { key: "party", label: t("tab.party"), icon: <PartyPopper strokeWidth={tab === "party" ? 2.4 : 2} /> },
          ]}
        >
          {state.nowPlaying && (
            <MiniPlayer
              item={state.nowPlaying}
              playback={state.playback}
              members={state.members}
              onOpen={openNowSinging}
              onToggle={isHost ? () => send({ type: state.playback.state === "playing" ? "pause" : "resume" }) : undefined}
            />
          )}
        </BottomTabs>
        <NowSingingSheet open={nowOpen && !!state.nowPlaying} onClose={closeNowSinging} />
        <TurnAlertBanner />
        <AwardPrompt />
      </div>
    </ShellContext.Provider>
  );
}

function EndScreen({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className={css.end}>
      <EmptyState icon={icon} title={title} action={action}>
        {text}
      </EmptyState>
    </div>
  );
}

function ThanksScreen({ onDone }: { onDone: () => void }) {
  return (
    <div className={css.thanks}>
      <div className={css.thanksInner}>
        <div className={css.confetti} aria-hidden>
          🎤
        </div>
        <h1 className={css.thanksTitle}>Thanks for singing!</h1>
        <p className={css.thanksText}>The party has ended. That was a good one.</p>
        <Button size="lg" variant="light" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
