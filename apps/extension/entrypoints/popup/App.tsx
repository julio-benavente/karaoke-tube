import { formatRoomCode } from "@karaoke-tube/shared";
import { Dices, ExternalLink, Power, Tv, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar, Button, Logo, Spinner, TextField, randomSeed } from "@karaoke-tube/ui";
import { createPartyApi, reopenTv, type PartyApi, type PartyInfo } from "./party";
import css from "./popup.module.css";

const ID_KEY = "kt:identity";

function loadIdentity(): { nickname: string; avatarSeed: string } {
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { nickname: "", avatarSeed: randomSeed() };
}

/** Toolbar popup: start a party, or see the running one. */
export function App() {
  const [api, setApi] = useState<PartyApi | null>(null);
  const [party, setParty] = useState<PartyInfo | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    createPartyApi().then(async (a) => {
      const p = await a.get();
      if (!alive) return;
      setApi(a);
      setParty(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={css.popup}>
      <header className={css.head}>
        <Logo size={24} />
        {api?.demo && <span className={css.demo}>Demo</span>}
      </header>
      {!api || party === undefined ? (
        <div className={css.loading}>
          <Spinner size={24} />
        </div>
      ) : party ? (
        <Running api={api} party={party} onEnded={() => setParty(null)} />
      ) : (
        <Start api={api} onStarted={(code) => setParty({ code, guestCount: 0 })} />
      )}
    </main>
  );
}

function Start({ api, onStarted }: { api: PartyApi; onStarted: (code: string) => void }) {
  const initial = loadIdentity();
  const [nickname, setNickname] = useState(initial.nickname);
  const [seed, setSeed] = useState(initial.avatarSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({ nickname: name, avatarSeed: seed }));
    } catch {
      // ignore
    }
    const r = await api.start(name, seed);
    setBusy(false);
    if (r.ok) onStarted(r.code);
    else setError(r.error);
  };

  return (
    <form className={css.body} onSubmit={submit}>
      <h1 className={css.title}>Start a karaoke party</h1>
      <p className={css.lead}>We'll open the host app and a YouTube window for your TV.</p>
      <div className={css.who}>
        <div className={css.avatarBox}>
          <Avatar seed={seed} size={64} name="Your avatar" />
          <button type="button" className={css.reroll} onClick={() => setSeed(randomSeed())} aria-label="New avatar">
            <Dices size={14} />
          </button>
        </div>
        <TextField
          label="Your name"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder="Host name"
          autoFocus
          className={css.name}
        />
      </div>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" block disabled={busy || !nickname.trim()}>
        {busy ? "Starting…" : "Start a party"}
      </Button>
    </form>
  );
}

function Running({ api, party, onEnded }: { api: PartyApi; party: PartyInfo; onEnded: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className={css.body}>
      <section className={css.card}>
        <span className={css.live}>
          <span className={css.dot} /> Party running
        </span>
        <span className={css.code}>{formatRoomCode(party.code)}</span>
        <span className={css.guests}>
          <Users size={14} /> {party.guestCount} {party.guestCount === 1 ? "guest" : "guests"}
        </span>
      </section>
      <Button variant="light" block icon={<ExternalLink size={16} />} onClick={() => api.openHost()}>
        Open host app
      </Button>
      {party.tvOpen === false && (
        <Button variant="secondary" block icon={<Tv size={16} />} onClick={() => void reopenTv()}>
          Reopen TV window
        </Button>
      )}
      {confirm ? (
        <div className={css.confirm}>
          <span>End the party for everyone?</span>
          <div className={css.confirmButtons}>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await api.end();
                onEnded();
              }}
            >
              End
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" block icon={<Power size={16} />} onClick={() => setConfirm(true)}>
          End party
        </Button>
      )}
    </div>
  );
}
