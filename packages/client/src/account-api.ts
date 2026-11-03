import type {
  Account,
  AccountErrorCode,
  AccountErrorResponse,
  AuthResponse,
  FavoritesResponse,
  FriendsResponse,
  LogPartyRequest,
  MeResponse,
  PartiesResponse,
  PartyLogEntry,
  RegisterRequest,
  Song,
  UpdateProfileRequest,
} from "@karaoke-tube/shared";

/** A failed /api/account call. `code` is the server's error code, or "network" when it couldn't be reached. */
export class AccountApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: AccountErrorCode | "network",
    message: string,
  ) {
    super(message);
    this.name = "AccountApiError";
  }
}

const TOKEN_KEY = "kt:account-token";

/** Where the sign-in token lives. Defaults to localStorage; the extension can pass chrome.storage-backed one. */
export interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export function localStorageToken(): TokenStore {
  return {
    get() {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
      } catch {
        // storage blocked: sign-in just won't survive a refresh
      }
    },
  };
}

/** Accounts are optional: with no token every call here fails with "unauthorized" and the app keeps working as a guest. */
export function createAccountApi(opts: { baseUrl?: string; tokens?: TokenStore } = {}) {
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");
  const tokens = opts.tokens ?? localStorageToken();

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = tokens.get();
    let res: Response;
    try {
      res = await fetch(`${base}/api/account${path}`, {
        method,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AccountApiError(0, "network", "Can't reach the server");
    }
    if (res.ok) return (await res.json()) as T;
    const err = (await res.json().catch(() => null)) as Partial<AccountErrorResponse> | null;
    if (res.status === 401 && err?.error === "unauthorized") tokens.set(null); // expired or signed out elsewhere
    throw new AccountApiError(res.status, err?.error ?? "bad_request", err?.message ?? `Request failed (${res.status})`);
  }

  const accept = async (p: Promise<AuthResponse>): Promise<Account> => {
    const r = await p;
    tokens.set(r.token);
    return r.account;
  };

  return {
    /** The saved token, so rooms can be created/joined as this account. Null = guest. */
    token: () => tokens.get(),
    register: (req: RegisterRequest) => accept(call("POST", "/register", req)),
    login: (username: string, password: string) => accept(call("POST", "/login", { username, password })),
    async logout() {
      try {
        if (tokens.get()) await call("POST", "/logout", {});
      } finally {
        tokens.set(null);
      }
    },
    me: () => call<MeResponse>("GET", "/me"),
    updateProfile: (patch: UpdateProfileRequest) => call<MeResponse>("PATCH", "/me", patch),
    changePassword: (current: string, next: string) => call<{ ok: true }>("POST", "/password", { current, next }),
    async deleteAccount(password: string) {
      await call("DELETE", "", { password });
      tokens.set(null);
    },
    favorites: () => call<FavoritesResponse>("GET", "/favorites"),
    addFavorite: (song: Song) => call<{ ok: true }>("PUT", "/favorites", { song }),
    removeFavorite: (videoId: string) => call<{ ok: true }>("DELETE", `/favorites/${encodeURIComponent(videoId)}`),
    friends: () => call<FriendsResponse>("GET", "/friends"),
    addFriend: (username: string) => call<FriendsResponse>("POST", "/friends", { username }),
    acceptFriend: (id: string) => call<FriendsResponse>("POST", `/friends/${encodeURIComponent(id)}/accept`, {}),
    removeFriend: (id: string) => call<FriendsResponse>("DELETE", `/friends/${encodeURIComponent(id)}`),
    parties: () => call<PartiesResponse>("GET", "/parties"),
    logParty: (req: LogPartyRequest) => call<{ party: PartyLogEntry }>("POST", "/parties", req),
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
