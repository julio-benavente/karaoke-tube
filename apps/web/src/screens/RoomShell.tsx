import { CircleSlash, Home, ListMusic, PartyPopper, Search, Settings as SettingsIcon, WifiOff } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  Banner,
  BottomTabs,
  Button,
  EmptyState,
  Logo,
  MiniPlayer,
  RoomLanguage,
  RoomProvider,
  AddFlowProvider,
  SingWithProvider,
  Spinner,
  ToastProvider,
  errorText,
  useRoom,
  useLang,
  useRoomErrors,
  useToast,
  useT,
} from "@karaoke-tube/ui";
import { dropRoomClient, getRoomClient, getSearchApi, hasJoined, markJoined, normalizeCode } from "../session";
import { useLogParty } from "../account/AccountContext";
import { useRoleToast } from "../useRoleToast";
import { NextSongFor } from "../host/NextSongFor";
import { TvOfflineBanner } from "../host/TvOfflineBanner";
import { useAfter } from "../host/useAfter";
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
      <RoomLanguage>
        <ToastProvider offset={148}>
          <SingWithProvider>
            <AddFlowProvider>
            <Shell
              code={code}
              retry={() => {
                dropRoomClient(code);
                setAttempt((n) => n + 1);
              }}
            />
            </AddFlowProvider>
          </SingWithProvider>
        </ToastProvider>
      </RoomLanguage>
    </RoomProvider>
  );
}

function Shell({ code, retry }: { code: string; retry: () => void }) {
  const t = useT();
  const [lang] = useLang();
  const { state, me, status, closeReason, isHost, send } = useRoom();
  const tvGone = useAfter(isHost && status === "open" && state?.playerConnected === false, 2500);
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const toast = useToast();
  const nowOpen = search.get("now") === "1";
  useLogParty(code, !!me, state?.status === "ended");

  useRoleToast();

  useRoomErrors((e) => {
    if (e.code === "song_unplayable") {
      toast.show(t("error.song_unplayable", { title: e.message }), { tone: "error" });
    } else if (e.code === "queue_limit") {
      const n = state?.settings.maxWaitingPerMember ?? 2;
      toast.show(t("search.limitToast", { count: n }), { tone: "error" });
    } else {
      toast.show(errorText(e.code, lang), { tone: "error" });
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
    // Tell the room first (it removes you and your waiting songs); then forget the spot on this device.
    try {
      if (status === "open" && state?.status === "open") getRoomClient(code).send({ type: "leave" });
    } catch {
      // not connected: just leave locally
    }
    markJoined(code, false);
    dropRoomClient(code);
    navigate("/join", { replace: true });
  }, [code, navigate, status, state?.status]);

  const ctx = useMemo(() => ({ openNowSinging, code, leave }), [openNowSinging, code, leave]);

  // ── end states ──
  if (closeReason === "forgotten") {
    // The saved spot (or an old rejoin link) isn't valid any more: forget it and offer to join again.
    return (
      <EndScreen
        icon={<CircleSlash />}
        title={t("shell.forgotten")}
        text={t("shell.forgottenText")}
        action={
          <Button
            onClick={() => {
              markJoined(code, false);
              dropRoomClient(code);
              navigate(`/join/${code}`, { replace: true });
            }}
          >
            {t("shell.joinAgain")}
          </Button>
        }
      />
    );
  }
  if (closeReason === "kicked") {
    return (
      <EndScreen
        icon={<CircleSlash />}
        title={t("shell.kicked")}
        text={t("shell.kickedText")}
        action={<Button onClick={leave}>{t("shell.backToStart")}</Button>}
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
        title={t("shell.lost")}
        text={t("shell.lostText", { code })}
        action={
          <>
            <Button onClick={retry}>{t("common.tryAgain")}</Button>
            <Button variant="secondary" onClick={leave}>
              {t("shell.another")}
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
        <p className={css.splashText}>{t("shell.joining", { code })}</p>
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
              {t("shell.reconnecting")}
            </Banner>
          </div>
        )}
        {tvGone && <TvOfflineBanner compact onOpenTv={() => {}} />}
        {isHost && <NextSongFor />}
        <main className={css.main}>
          <Outlet />
        </main>
        <BottomTabs
          active={tab}
          onSelect={(k) => navigate(k === "settings" ? `/host/${code}/settings` : k === "home" ? `/r/${code}` : `/r/${code}/${k}`)}
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
            // Co-hosts (and a stand-in host, who is a plain host here) change the party settings in the host app.
            ...(isHost ? [{ key: "settings", label: t("nav.settings"), icon: <SettingsIcon strokeWidth={2} /> }] : []),
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
  const t = useT();
  return (
    <div className={css.thanks}>
      <div className={css.thanksInner}>
        <div className={css.confetti} aria-hidden>
          🎤
        </div>
        <h1 className={css.thanksTitle}>{t("shell.thanks")}</h1>
        <p className={css.thanksText}>{t("shell.thanksText")}</p>
        <Button size="lg" variant="light" onClick={onDone}>
          {t("common.done")}
        </Button>
      </div>
    </div>
  );
}
