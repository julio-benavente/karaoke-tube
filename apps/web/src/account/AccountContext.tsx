import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAccountApi, localStorageCredentials, type AccountApi } from "@karaoke-tube/client";
import type { Account, AccountStats, RegisterRequest } from "@karaoke-tube/shared";
import { ACCOUNTS_ENABLED } from "./enabled";

/** Accounts are optional. `account === null` is a guest, and everything outside /account works the same for them. */
type Ctx = {
  api: AccountApi;
  account: Account | null;
  stats: AccountStats | null;
  /** True until we know whether the saved token still works. */
  loading: boolean;
  register(req: RegisterRequest): Promise<void>;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Re-reads the account (after editing the profile, favorites, friends…). */
  refresh(): Promise<void>;
  setMe(me: { account: Account; stats: AccountStats }): void;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createAccountApi(), []);
  const [account, setAccount] = useState<Account | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(() => ACCOUNTS_ENABLED && api.token() !== null);

  const refresh = useCallback(async () => {
    if (!ACCOUNTS_ENABLED || !api.token()) {
      setAccount(null);
      setStats(null);
      return;
    }
    try {
      const me = await api.me();
      setAccount(me.account);
      setStats(me.stats);
    } catch (e) {
      // A bad token is cleared by the api; a network error keeps whatever we had.
      if (!api.token()) {
        setAccount(null);
        setStats(null);
      } else if (e instanceof Error) console.warn("[account]", e.message);
    }
  }, [api]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      api,
      account,
      stats,
      loading,
      async register(req) {
        setAccount(await api.register(req));
        await refresh();
      },
      async signIn(username, password) {
        setAccount(await api.login(username, password));
        await refresh();
      },
      async signOut() {
        await api.logout().catch(() => {});
        setAccount(null);
        setStats(null);
      },
      refresh,
      setMe(me) {
        setAccount(me.account);
        setStats(me.stats);
      },
    }),
    [api, account, stats, loading, refresh],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Ctx {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount outside AccountProvider");
  return ctx;
}

/**
 * Signed in? Writes this party into the account's log when you're in it and again when it ends, so the log gets the
 * recap. Does nothing for guests. The room vouches for the member id + key, so it can't be faked.
 */
export function useLogParty(code: string, inParty: boolean, ended: boolean) {
  const { api, account } = useAccount();
  const last = useRef("");
  useEffect(() => {
    if (!account || !inParty) return;
    const stage = `${account.id}:${code}:${ended}`;
    if (last.current === stage) return;
    const creds = localStorageCredentials().load(code);
    if (!creds) return;
    last.current = stage;
    // The recap lands a moment after the room says "ended", so log once more shortly after.
    const log = () => api.logParty({ code, ...creds }).catch(() => {});
    void log();
    if (!ended) return;
    const timer = setTimeout(log, 1500);
    return () => clearTimeout(timer);
  }, [api, account, code, inParty, ended]);
}

/** Favorites as a set of video ids, with a toggle. Empty and inert for guests. */
export function useFavorites() {
  const { api, account } = useAccount();
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!account) return setIds(new Set());
    let live = true;
    api
      .favorites()
      .then((r) => live && setIds(new Set(r.favorites.map((f) => f.song.videoId))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, account]);
  const toggle = useCallback(
    async (song: import("@karaoke-tube/shared").Song) => {
      const has = ids.has(song.videoId);
      setIds((s) => {
        const n = new Set(s);
        if (has) n.delete(song.videoId);
        else n.add(song.videoId);
        return n;
      });
      try {
        if (has) await api.removeFavorite(song.videoId);
        else await api.addFavorite(song);
      } catch {
        setIds((s) => {
          const n = new Set(s);
          if (has) n.add(song.videoId);
          else n.delete(song.videoId);
          return n;
        });
        return null;
      }
      return !has;
    },
    [api, ids],
  );
  return { signedIn: !!account, ids, toggle };
}
