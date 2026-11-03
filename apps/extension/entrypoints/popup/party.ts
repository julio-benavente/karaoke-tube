// Popup ↔ background messages (Spec A implements the background side; see "Requests for the other track" in B's spec).

/** `tvOpen`: whether the party's YouTube window (the TV) is open. */
export type PartyInfo = { code: string; guestCount: number; tvOpen?: boolean };

export type PopupMessage =
  | { type: "START_PARTY"; nickname: string; avatarSeed: string } // → { ok: true, code } | { ok: false, error }
  | { type: "GET_PARTY" } // → { ok: true, party: PartyInfo | null }
  | { type: "END_PARTY" } // → { ok: true }
  | { type: "OPEN_HOST" } // background opens or focuses the host app on the website
  | { type: "SHOW_ON_TV" }; // background reopens/focuses the YouTube window

/** Reopen (or bring forward) the party's TV window. */
export async function reopenTv() {
  await send({ type: "SHOW_ON_TV" });
  window.close();
}

type Reply = { ok?: boolean; code?: string; error?: string; party?: PartyInfo | null } | undefined;

async function send(msg: PopupMessage): Promise<Reply> {
  try {
    return (await browser.runtime.sendMessage(msg)) as Reply;
  } catch {
    return undefined; // no background (dev preview) or it threw
  }
}

// Demo fallback while the background doesn't handle these messages yet: keeps a pretend party in localStorage.
const DEMO_KEY = "kt:popup:demo-party";
function demoParty(): PartyInfo | null {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null") as PartyInfo | null;
  } catch {
    return null;
  }
}
function setDemoParty(p: PartyInfo | null) {
  try {
    if (p) localStorage.setItem(DEMO_KEY, JSON.stringify(p));
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    // ignore
  }
}

export type PartyApi = {
  demo: boolean;
  get(): Promise<PartyInfo | null>;
  start(nickname: string, avatarSeed: string): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  end(): Promise<void>;
  openHost(): Promise<void>;
};

export async function createPartyApi(): Promise<PartyApi> {
  const probe = await send({ type: "GET_PARTY" });
  const demo = !probe || typeof probe.ok !== "boolean";
  if (demo) {
    return {
      demo,
      get: async () => demoParty(),
      start: async () => {
        const code = "groovy-demo-party";
        setDemoParty({ code, guestCount: 0 });
        return { ok: true, code };
      },
      end: async () => setDemoParty(null),
      openHost,
    };
  }
  return {
    demo,
    get: async () => (await send({ type: "GET_PARTY" }))?.party ?? null,
    start: async (nickname, avatarSeed) => {
      const r = await send({ type: "START_PARTY", nickname, avatarSeed });
      if (r?.ok && r.code) return { ok: true, code: r.code };
      return { ok: false, error: r?.error ?? "Couldn't start the party. Check your connection and try again." };
    },
    end: async () => {
      await send({ type: "END_PARTY" });
    },
    openHost,
  };
}

/** The host app lives on the website; the background opens (or focuses) it with the host's link. */
async function openHost() {
  await send({ type: "OPEN_HOST" });
  window.close();
}
